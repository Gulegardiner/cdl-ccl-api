const db = require("../db/index");
const jwt = require("jsonwebtoken");
const jwtconfig = require("../jwt_config/index.js");

// 从请求中解析当前用户信息（account 与 identity）
function getUserFromRequest(req) {
  if (req.auth && req.auth.account) {
    return {
      account: req.auth.account,
      identity: req.auth.identity || "user",
    };
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, jwtconfig.jwtSecretKey);
      if (decoded && decoded.account) {
        return {
          account: decoded.account,
          identity: decoded.identity || "user",
        };
      }
    } catch (e) {
      // 忽略无效或过期 token
    }
  }
  return null;
}

// 1. 获取留言列表（支持分页、搜索、公开/私密权限自适应）
exports.getMessageList = (req, res) => {
  let { page = 1, limit = 10, keyword, is_public, my_only } = req.body || {};
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.max(1, Math.min(50, parseInt(limit) || 10));
  const offset = (page - 1) * limit;

  const currentUser = getUserFromRequest(req);
  const currentAccount = currentUser?.account;
  const isAdmin = currentUser?.identity === "admin";

  const conditions = ["m.status = 1"];
  const params = [];

  // 权限过滤
  if (isAdmin) {
    // 管理员：可看所有状态正常的留言
    if (my_only && currentAccount) {
      conditions.push("m.account = ?");
      params.push(currentAccount);
    }
    if (typeof is_public !== "undefined" && is_public !== null && is_public !== "") {
      conditions.push("m.is_public = ?");
      params.push(Number(is_public));
    }
  } else if (currentAccount) {
    // 普通登录用户：可看公开的 + 自己发布的私密留言
    if (my_only) {
      conditions.push("m.account = ?");
      params.push(currentAccount);
      if (typeof is_public !== "undefined" && is_public !== null && is_public !== "") {
        conditions.push("m.is_public = ?");
        params.push(Number(is_public));
      }
    } else {
      if (typeof is_public !== "undefined" && is_public !== null && is_public !== "") {
        if (Number(is_public) === 0) {
          // 只看私密，则必须是自己的
          conditions.push("m.is_public = 0 AND m.account = ?");
          params.push(currentAccount);
        } else {
          // 只看公开
          conditions.push("m.is_public = 1");
        }
      } else {
        conditions.push("(m.is_public = 1 OR m.account = ?)");
        params.push(currentAccount);
      }
    }
  } else {
    // 未登录访客：仅看公开留言
    conditions.push("m.is_public = 1");
  }

  // 关键词搜索（支持标题或内容搜索）
  if (keyword && typeof keyword === "string" && keyword.trim()) {
    conditions.push("(m.title LIKE ? OR m.content LIKE ?)");
    const kw = `%${keyword.trim()}%`;
    params.push(kw, kw);
  }

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // 统计总条数
  const countSql = `SELECT COUNT(*) AS total FROM messages m ${whereClause}`;

  db.query(countSql, params, (err, countResult) => {
    if (err) return res.cc(err);
    const total = countResult[0]?.total || 0;

    if (total === 0) {
      return res.send({
        status: 200,
        message: "获取留言列表成功",
        data: [],
        total: 0,
        page,
        limit,
      });
    }

    // 列表查询（置顶贴优先排在最前，随后按创建时间倒序）
    const listSql = `
      SELECT 
        m.id,
        m.account,
        m.title,
        m.content,
        m.images,
        m.is_public,
        m.is_top,
        m.top_time,
        m.status,
        m.reply_count,
        m.create_time,
        m.update_time,
        u.nickname,
        u.image_url AS avatar,
        u.identity AS user_identity
      FROM messages m
      LEFT JOIN users u ON m.account = u.account
      ${whereClause}
      ORDER BY m.is_top DESC, m.top_time DESC, m.create_time DESC
      LIMIT ? OFFSET ?
    `;

    db.query(listSql, [...params, limit, offset], (listErr, rows) => {
      if (listErr) return res.cc(listErr);

      // 处理 images 字段格式（支持 JSON 数组解析）
      const list = rows.map((item) => {
        let images = [];
        if (item.images) {
          try {
            images = JSON.parse(item.images);
            if (!Array.isArray(images)) images = [item.images];
          } catch (e) {
            images = item.images.split(",").map((s) => s.trim()).filter(Boolean);
          }
        }
        return {
          ...item,
          images,
        };
      });

      res.send({
        status: 200,
        message: "获取留言列表成功",
        data: list,
        total,
        page,
        limit,
      });
    });
  });
};

// 2. 获取留言详情及回复列表
exports.getMessageDetail = (req, res) => {
  const { id } = req.body || {};
  if (!id) {
    return res.send({ status: 400, message: "缺少必要参数 id" });
  }

  const currentUser = getUserFromRequest(req);
  const currentAccount = currentUser?.account;
  const isAdmin = currentUser?.identity === "admin";

  const messageSql = `
    SELECT 
      m.id,
      m.account,
      m.title,
      m.content,
      m.images,
      m.is_public,
      m.is_top,
      m.top_time,
      m.status,
      m.reply_count,
      m.create_time,
      m.update_time,
      u.nickname,
      u.image_url AS avatar,
      u.identity AS user_identity
    FROM messages m
    LEFT JOIN users u ON m.account = u.account
    WHERE m.id = ? AND m.status = 1
  `;

  db.query(messageSql, [id], (err, rows) => {
    if (err) return res.cc(err);
    if (!rows || rows.length === 0) {
      return res.send({ status: 404, message: "留言不存在或已被删除" });
    }

    const message = rows[0];

    // 权限校验：如果是非公开留言，只有发帖人和管理员可以查看详情
    if (message.is_public === 0) {
      if (!currentAccount || (message.account !== currentAccount && !isAdmin)) {
        return res.send({ status: 403, message: "该留言为私密留言，暂无查看权限" });
      }
    }

    // 解析图片
    let images = [];
    if (message.images) {
      try {
        images = JSON.parse(message.images);
        if (!Array.isArray(images)) images = [message.images];
      } catch (e) {
        images = message.images.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    message.images = images;

    // 查询该留言的所有回复
    const repliesSql = `
      SELECT 
        r.id,
        r.message_id,
        r.account,
        r.reply_to_account,
        r.parent_id,
        r.content,
        r.is_admin,
        r.status,
        r.create_time,
        u.nickname,
        u.image_url AS avatar,
        u.identity AS user_identity,
        tu.nickname AS reply_to_nickname
      FROM message_replies r
      LEFT JOIN users u ON r.account = u.account
      LEFT JOIN users tu ON r.reply_to_account = tu.account
      WHERE r.message_id = ? AND r.status = 1
      ORDER BY r.create_time ASC
    `;

    db.query(repliesSql, [id], (replyErr, replyRows) => {
      if (replyErr) return res.cc(replyErr);

      res.send({
        status: 200,
        message: "获取留言详情成功",
        data: {
          ...message,
          replies: replyRows || [],
        },
      });
    });
  });
};

// 3. 发布留言
exports.createMessage = (req, res) => {
  const user = req.auth;
  if (!user || !user.account) {
    return res.send({ status: 401, message: "请先登录" });
  }

  const { title = "", content, images, is_public = 1 } = req.body || {};
  if (!content || !content.trim()) {
    return res.send({ status: 400, message: "留言内容不能为空" });
  }

  let imagesStr = null;
  if (images) {
    if (Array.isArray(images)) {
      imagesStr = JSON.stringify(images);
    } else if (typeof images === "string") {
      imagesStr = images;
    }
  }

  const insertData = {
    account: user.account,
    title: title ? title.trim() : null,
    content: content.trim(),
    images: imagesStr,
    is_public: Number(is_public) === 0 ? 0 : 1,
    is_top: 0,
    status: 1,
    reply_count: 0,
    create_time: new Date(),
  };

  const insertSql = "INSERT INTO messages SET ?";
  db.query(insertSql, insertData, (err, result) => {
    if (err) return res.cc(err);
    res.send({
      status: 200,
      message: "发布留言成功",
      data: {
        id: result.insertId,
      },
    });
  });
};

// 4. 发表回复
exports.createReply = (req, res) => {
  const user = req.auth;
  if (!user || !user.account) {
    return res.send({ status: 401, message: "请先登录" });
  }

  const { message_id, content, parent_id = 0, reply_to_account = null } = req.body || {};
  if (!message_id) {
    return res.send({ status: 400, message: "缺少必要参数 message_id" });
  }
  if (!content || !content.trim()) {
    return res.send({ status: 400, message: "回复内容不能为空" });
  }

  // 先检查主留言是否存在及权限
  const checkSql = "SELECT id, account, is_public, status FROM messages WHERE id = ?";
  db.query(checkSql, [message_id], (err, rows) => {
    if (err) return res.cc(err);
    if (!rows || rows.length === 0 || rows[0].status !== 1) {
      return res.send({ status: 404, message: "所属留言不存在或已被删除" });
    }

    const message = rows[0];
    const isAdmin = user.identity === "admin";

    // 私密留言只有发帖人和管理员可以回复
    if (message.is_public === 0) {
      if (message.account !== user.account && !isAdmin) {
        return res.send({ status: 403, message: "私密留言仅发帖人与管理员可回复" });
      }
    }

    const replyData = {
      message_id: Number(message_id),
      account: user.account,
      reply_to_account: reply_to_account || null,
      parent_id: Number(parent_id) || 0,
      content: content.trim(),
      is_admin: isAdmin ? 1 : 0,
      status: 1,
      create_time: new Date(),
    };

    const insertReplySql = "INSERT INTO message_replies SET ?";
    db.query(insertReplySql, replyData, (insertErr, result) => {
      if (insertErr) return res.cc(insertErr);

      // 主留言回复计数 +1
      const updateCountSql = "UPDATE messages SET reply_count = reply_count + 1 WHERE id = ?";
      db.query(updateCountSql, [message_id], (uErr) => {
        if (uErr) console.error("更新留言回复数失败:", uErr);
      });

      res.send({
        status: 200,
        message: "回复成功",
        data: {
          id: result.insertId,
        },
      });
    });
  });
};

// 5. 置顶 / 取消置顶留言（仅管理员）
exports.toggleTop = (req, res) => {
  const user = req.auth;
  if (!user || user.identity !== "admin") {
    return res.send({ status: 403, message: "无权限操作，仅管理员可置顶" });
  }

  const { id, is_top } = req.body || {};
  if (!id || typeof is_top === "undefined") {
    return res.send({ status: 400, message: "缺少必要参数 id 或 is_top" });
  }

  const targetTop = Number(is_top) === 1 ? 1 : 0;
  const topTime = targetTop === 1 ? new Date() : null;

  const updateSql = "UPDATE messages SET is_top = ?, top_time = ? WHERE id = ?";
  db.query(updateSql, [targetTop, topTime, id], (err, result) => {
    if (err) return res.cc(err);
    if (result.affectedRows === 0) {
      return res.send({ status: 404, message: "未找到该留言" });
    }
    res.send({
      status: 200,
      message: targetTop === 1 ? "置顶成功" : "已取消置顶",
    });
  });
};

// 6. 删除留言（发帖人本人或管理员）
exports.deleteMessage = (req, res) => {
  const user = req.auth;
  if (!user || !user.account) {
    return res.send({ status: 401, message: "请先登录" });
  }

  const { id } = req.body || {};
  if (!id) {
    return res.send({ status: 400, message: "缺少必要参数 id" });
  }

  const checkSql = "SELECT account, status FROM messages WHERE id = ?";
  db.query(checkSql, [id], (err, rows) => {
    if (err) return res.cc(err);
    if (!rows || rows.length === 0) {
      return res.send({ status: 404, message: "留言不存在" });
    }

    const message = rows[0];
    const isAdmin = user.identity === "admin";
    if (message.account !== user.account && !isAdmin) {
      return res.send({ status: 403, message: "无权限删除此留言" });
    }

    const deleteSql = "UPDATE messages SET status = 0 WHERE id = ?";
    db.query(deleteSql, [id], (delErr) => {
      if (delErr) return res.cc(delErr);
      res.send({
        status: 200,
        message: "删除留言成功",
      });
    });
  });
};

// 7. 删除回复（回复人、楼主或管理员）
exports.deleteReply = (req, res) => {
  const user = req.auth;
  if (!user || !user.account) {
    return res.send({ status: 401, message: "请先登录" });
  }

  const { id } = req.body || {};
  if (!id) {
    return res.send({ status: 400, message: "缺少必要参数 id" });
  }

  const checkSql = `
    SELECT r.id, r.message_id, r.account AS reply_account, r.status, m.account AS message_account 
    FROM message_replies r
    LEFT JOIN messages m ON r.message_id = m.id
    WHERE r.id = ?
  `;

  db.query(checkSql, [id], (err, rows) => {
    if (err) return res.cc(err);
    if (!rows || rows.length === 0) {
      return res.send({ status: 404, message: "回复不存在" });
    }

    const reply = rows[0];
    const isAdmin = user.identity === "admin";
    const isReplyOwner = reply.reply_account === user.account;
    const isMessageOwner = reply.message_account === user.account;

    if (!isReplyOwner && !isMessageOwner && !isAdmin) {
      return res.send({ status: 403, message: "无权限删除此回复" });
    }

    const delSql = "UPDATE message_replies SET status = 0 WHERE id = ?";
    db.query(delSql, [id], (delErr) => {
      if (delErr) return res.cc(delErr);

      // 主留言回复计数 -1（保持非负）
      const decrSql = "UPDATE messages SET reply_count = GREATEST(0, reply_count - 1) WHERE id = ?";
      db.query(decrSql, [reply.message_id], (uErr) => {
        if (uErr) console.error("扣减回复计数失败:", uErr);
      });

      res.send({
        status: 200,
        message: "删除回复成功",
      });
    });
  });
};
