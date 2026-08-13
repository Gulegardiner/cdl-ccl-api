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

// 1. 获取更新日志列表（支持分页，按时间倒序）
exports.getLogList = (req, res) => {
  let { page = 1, limit = 10 } = req.body || {};
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.max(1, Math.min(50, parseInt(limit) || 10));
  const offset = (page - 1) * limit;

  const countSql = "SELECT COUNT(*) AS total FROM update_logs WHERE status = 1";

  db.query(countSql, (err, countResult) => {
    if (err) return res.cc(err);
    const total = countResult[0]?.total || 0;

    if (total === 0) {
      return res.send({
        status: 200,
        message: "获取更新日志列表成功",
        data: [],
        total: 0,
        page,
        limit,
      });
    }

    const listSql = `
      SELECT id, version, title, content, images, create_time 
      FROM update_logs 
      WHERE status = 1 
      ORDER BY create_time DESC 
      LIMIT ? OFFSET ?
    `;

    db.query(listSql, [limit, offset], (listErr, rows) => {
      if (listErr) return res.cc(listErr);

      // 处理 images 字段格式
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
        message: "获取更新日志列表成功",
        data: list,
        total,
        page,
        limit,
      });
    });
  });
};

// 2. 创建更新日志（仅管理员）
exports.createLog = (req, res) => {
  const currentUser = getUserFromRequest(req);
  if (!currentUser || currentUser.identity !== "admin") {
    return res.send({ status: 403, message: "无权限操作，仅管理员可用" });
  }

  const { version, title, content, images } = req.body || {};
  if (!content || !content.trim()) {
    return res.send({ status: 400, message: "更新内容不能为空" });
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
    version: version ? version.trim() : null,
    title: title ? title.trim() : null,
    content: content.trim(),
    images: imagesStr,
    status: 1,
    create_time: new Date(),
  };

  const insertSql = "INSERT INTO update_logs SET ?";
  db.query(insertSql, insertData, (err, result) => {
    if (err) return res.cc(err);
    res.send({
      status: 200,
      message: "发布更新日志成功",
      data: {
        id: result.insertId,
      },
    });
  });
};

// 3. 删除更新日志（仅管理员）
exports.deleteLog = (req, res) => {
  const currentUser = getUserFromRequest(req);
  if (!currentUser || currentUser.identity !== "admin") {
    return res.send({ status: 403, message: "无权限操作，仅管理员可用" });
  }

  const { id } = req.body || {};
  if (!id) {
    return res.send({ status: 400, message: "缺少必要参数 id" });
  }

  const deleteSql = "UPDATE update_logs SET status = 0 WHERE id = ?";
  db.query(deleteSql, [id], (err, result) => {
    if (err) return res.cc(err);
    if (result.affectedRows === 0) {
      return res.send({ status: 404, message: "未找到该更新日志" });
    }
    res.send({
      status: 200,
      message: "删除更新日志成功",
    });
  });
};
