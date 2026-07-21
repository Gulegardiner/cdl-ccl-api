const db = require("../db/index");

// 获取卡池列表（支持分页和筛选）
exports.getBookList = (req, res) => {
  let { page, limit, theme, keyword } = req.body;
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
      sql += ` LIMIT ${limit} OFFSET ${offset}`;
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
  const { book_id, name, theme, description, cover_color, cover_image_url } = req.body;

  if (!book_id || !name) {
    return res.send({
      status: 400,
      message: "book_id 和 name 不能为空",
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
    if (result.affectedRows === 0) {
      return res.send({
        status: 404,
        message: "卡池不存在或未修改任何字段",
      });
    }
    return res.send({
      status: 200,
      message: "卡池更新成功",
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

  const sql = "DELETE FROM books WHERE book_id = ?";
  db.query(sql, [book_id], (err, result) => {
    if (err) {
      return res.send({
        status: 500,
        message: "数据库删除失败",
        error: err,
      });
    }
    if (result.affectedRows === 0) {
      return res.send({
        status: 404,
        message: "卡池不存在",
      });
    }
    return res.send({
      status: 200,
      message: "删除成功",
    });
  });
};
