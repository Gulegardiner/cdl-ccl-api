const db = require("../db/index");

// 获取卡池列表（支持分页和筛选）
exports.getBookList = (req, res) => {
  let { page, limit, theme, keyword, status, creater_name, creater_account, login_account, admin_account } = req.body;
  const queryConditions = [];
  const queryValues = [];

  if (theme) {
    queryConditions.push("theme = ?");
    queryValues.push(theme);
  }
  if (keyword) {
    queryConditions.push("(name LIKE ? OR description LIKE ?)");
    queryValues.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (creater_name) {
    queryConditions.push("creater_name LIKE ?");
    queryValues.push(`%${creater_name}%`);
  }

  if (admin_account) {
    queryConditions.push("(status = 'pass' OR status = 'wait' OR (status = 'draft' AND creater_account = ?))");
    queryValues.push(admin_account);
  } else if (login_account) {
    queryConditions.push("(status = 'pass' OR creater_account = ?)");
    queryValues.push(login_account);
  } else {
    if (status) {
      queryConditions.push("status = ?");
      queryValues.push(status);
    }
    if (creater_account) {
      queryConditions.push("creater_account = ?");
      queryValues.push(creater_account);
    }
  }

  let sql = "SELECT * FROM books";
  if (queryConditions.length) {
    sql += ` WHERE ${queryConditions.join(" AND ")}`;
  }

  db.query(sql, queryValues, (err, result) => {
    if (err) {
      return res.send({
        status: 500,
        message: "数据库查询失败",
        error: err,
      });
    }
    const total = result.length;

    // 分页
    if (page && limit) {
      const offset = (page - 1) * limit;
      sql += ` LIMIT ? OFFSET ?`;
      queryValues.push(limit, offset);
    }

    db.query(sql, queryValues, (err, result) => {
      if (err) {
        return res.send({
          status: 500,
          message: "数据库查询失败",
          error: err,
        });
      }
      return res.send({
        status: 200,
        message: "获取卡池列表成功",
        data: result,
        total,
        pagination: page && limit ? { page, limit, total } : undefined,
      });
    });
  });
};

// 获取单个卡池详情
exports.getBookDetail = (req, res) => {
  const { book_id } = req.body;
  if (!book_id) {
    return res.send({
      status: 400,
      message: "缺少 book_id 参数",
    });
  }

  const sql = "SELECT * FROM books WHERE book_id = ?";
  db.query(sql, book_id, (err, result) => {
    if (err) return res.cc(err);
    if (result.length === 0) {
      return res.send({
        status: 404,
        message: "卡池不存在",
      });
    }
    return res.send({
      status: 200,
      message: "获取卡池详情成功",
      data: result[0],
    });
  });
};

// 新增卡池
exports.createBook = (req, res) => {
  const { book_id, name, theme, description, cover_color, cover_image_url, creater_name, creater_account } = req.body;

  if (!book_id || !name) {
    return res.send({
      status: 400,
      message: "book_id 和 name 不能为空",
    });
  }

  if (!creater_name || !creater_account) {
    return res.send({
      status: 400,
      message: "creater_name 和 creater_account 不能为空",
    });
  }

  // 检查 book_id 是否已存在
  const checkSql = "SELECT * FROM books WHERE book_id = ?";
  db.query(checkSql, book_id, (err, results) => {
    if (err) return res.cc(err);
    if (results.length > 0) {
      return res.send({
        status: 500,
        message: "卡池ID已存在",
      });
    }

    const now = Date.now();
    const sql = "INSERT INTO books SET ?";
    db.query(
      sql,
      {
        book_id,
        name,
        theme: theme || null,
        description: description || null,
        cover_color: cover_color || null,
        cover_image_url: cover_image_url || null,
        creater_name,
        creater_account,
        status: "draft",
        created_at: now,
        updated_at: now,
      },
      (err, result) => {
        if (err) return res.cc(err);
        if (result.affectedRows !== 1) {
          return res.send({
            status: 500,
            message: "新增卡池失败",
          });
        }
        res.send({
          status: 200,
          message: "新增卡池成功",
        });
      }
    );
  });
};

// 更新卡池
exports.updateBook = (req, res) => {
  const { book_id, ...fields } = req.body;

  if (!book_id) {
    return res.send({
      status: 400,
      message: "缺少 book_id 参数",
    });
  }

  // 1. 先查询卡池原数据，用于权限判定
  const querySql = "SELECT * FROM books WHERE book_id = ?";
  db.query(querySql, book_id, (err, result) => {
    if (err) return res.cc(err);
    if (result.length === 0) {
      return res.send({ status: 404, message: "卡池不存在" });
    }

    const book = result[0];
    const userAccount = req.auth ? req.auth.account : null;
    const userIdentity = req.auth ? req.auth.identity : null;

    // 2. 状态流转越权校验
    if (fields.status && fields.status !== book.status) {
      // 变更为 'pass' (通过发布) 或 从 'pass' 变更为其他状态 (下架操作)，必须是管理员
      const isAuditAction = fields.status === 'pass' || book.status === 'pass';
      if (isAuditAction && userIdentity !== 'admin') {
        return res.send({
          status: 403,
          message: "无权操作：只有管理员可审核/发布卡池",
        });
      }
    }

    // 3. 普通字段修改校验：必须是创建者本人或管理员
    const isCreator = userAccount && book.creater_account === userAccount;
    const isAdmin = userIdentity === 'admin';
    if (!isCreator && !isAdmin) {
      return res.send({
        status: 403,
        message: "没有操作权限（非卡池创建者且非管理员）",
      });
    }

    if (Object.keys(fields).length === 0) {
      return res.send({
        status: 400,
        message: "未提供任何需要更新的字段",
      });
    }

    // 更新时间戳
    fields.updated_at = Date.now();

    const updates = Object.keys(fields)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = [...Object.values(fields), book_id];
    const sql = `UPDATE books SET ${updates} WHERE book_id = ?`;

    db.query(sql, values, (err, result) => {
      if (err) {
        return res.send({
          status: 500,
          message: "更新失败",
          error: err,
        });
      }
      return res.send({
        status: 200,
        message: "卡池更新成功",
      });
    });
  });
};

// 删除卡池
exports.deleteBook = (req, res) => {
  const { book_id } = req.body;

  if (!book_id) {
    return res.send({
      status: 400,
      message: "缺少 book_id 参数",
    });
  }

  // 1. 校验删除权限：只有创建者本人或管理员可以删除
  const querySql = "SELECT * FROM books WHERE book_id = ?";
  db.query(querySql, book_id, (err, result) => {
    if (err) return res.cc(err);
    if (result.length === 0) {
      return res.send({ status: 404, message: "卡池不存在" });
    }

    const book = result[0];
    const userAccount = req.auth ? req.auth.account : null;
    const userIdentity = req.auth ? req.auth.identity : null;

    if (book.creater_account !== userAccount && userIdentity !== 'admin') {
      return res.send({
        status: 403,
        message: "无权操作：只有创建者或管理员可删除卡池",
      });
    }

    const sql = "DELETE FROM books WHERE book_id = ?";
    db.query(sql, [book_id], (err, result) => {
      if (err) {
        return res.send({
          status: 500,
          message: "数据库删除失败",
          error: err,
        });
      }
      return res.send({
        status: 200,
        message: "删除成功",
      });
    });
  });
};
