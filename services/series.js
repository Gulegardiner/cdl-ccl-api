const db = require("../db/index");

// 获取分组列表（支持按 book_id 筛选和分页）
exports.getSeriesList = (req, res) => {
  let { page, limit, book_id, keyword } = req.body;
  const queryConditions = [];
  const queryValues = [];

  if (book_id) {
    queryConditions.push("book_id = ?");
    queryValues.push(book_id);
  }
  if (keyword) {
    queryConditions.push("(name LIKE ? OR description LIKE ?)");
    queryValues.push(`%${keyword}%`, `%${keyword}%`);
  }

  let sql = "SELECT * FROM series";
  if (queryConditions.length) {
    sql += ` WHERE ${queryConditions.join(" AND ")}`;
  }
  sql += " ORDER BY created_at ASC";

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
        message: "获取分组列表成功",
        data: result,
        total,
        pagination: page && limit ? { page, limit, total } : undefined,
      });
    });
  });
};

// 获取单个分组详情
exports.getSeriesDetail = (req, res) => {
  const { series_id } = req.body;
  if (!series_id) {
    return res.send({
      status: 400,
      message: "缺少 series_id 参数",
    });
  }

  const sql = "SELECT * FROM series WHERE series_id = ?";
  db.query(sql, series_id, (err, result) => {
    if (err) return res.cc(err);
    if (result.length === 0) {
      return res.send({
        status: 404,
        message: "分组不存在",
      });
    }
    return res.send({
      status: 200,
      message: "获取分组详情成功",
      data: result[0],
    });
  });
};

// 新增分组
exports.createSeries = (req, res) => {
  const { series_id, book_id, name, description } = req.body;

  if (!series_id || !book_id || !name) {
    return res.send({
      status: 400,
      message: "series_id、book_id 和 name 不能为空",
    });
  }

  // 检查 series_id 是否已存在
  const checkSql = "SELECT * FROM series WHERE series_id = ?";
  db.query(checkSql, series_id, (err, results) => {
    if (err) return res.cc(err);
    if (results.length > 0) {
      return res.send({
        status: 500,
        message: "分组ID已存在",
      });
    }

    // 检查关联的卡池是否存在
    const bookSql = "SELECT * FROM books WHERE book_id = ?";
    db.query(bookSql, book_id, (err, bookResults) => {
      if (err) return res.cc(err);
      if (bookResults.length === 0) {
        return res.send({
          status: 400,
          message: "关联的卡池不存在",
        });
      }

      const now = Date.now();
      const sql = "INSERT INTO series SET ?";
      db.query(
        sql,
        {
          series_id,
          book_id,
          name,
          description: description || null,
          created_at: now,
          updated_at: now,
        },
        (err, result) => {
          if (err) return res.cc(err);
          if (result.affectedRows !== 1) {
            return res.send({
              status: 500,
              message: "新增分组失败",
            });
          }
          res.send({
            status: 200,
            message: "新增分组成功",
          });
        }
      );
    });
  });
};

// 更新分组
exports.updateSeries = (req, res) => {
  const { series_id, ...fields } = req.body;

  if (!series_id) {
    return res.send({
      status: 400,
      message: "缺少 series_id 参数",
    });
  }

  if (Object.keys(fields).length === 0) {
    return res.send({
      status: 400,
      message: "未提供任何需要更新的字段",
    });
  }

  // 如果修改了 book_id，检查新卡池是否存在
  if (fields.book_id) {
    const bookSql = "SELECT * FROM books WHERE book_id = ?";
    db.query(bookSql, fields.book_id, (err, bookResults) => {
      if (err) return res.cc(err);
      if (bookResults.length === 0) {
        return res.send({
          status: 400,
          message: "关联的卡池不存在",
        });
      }
      doUpdate();
    });
  } else {
    doUpdate();
  }

  function doUpdate() {
    // 更新时间戳
    fields.updated_at = Date.now();

    const updates = Object.keys(fields)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = [...Object.values(fields), series_id];
    const sql = `UPDATE series SET ${updates} WHERE series_id = ?`;

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
          message: "分组不存在或未修改任何字段",
        });
      }
      return res.send({
        status: 200,
        message: "分组更新成功",
      });
    });
  }
};

// 删除分组
exports.deleteSeries = (req, res) => {
  const { series_id } = req.body;

  if (!series_id) {
    return res.send({
      status: 400,
      message: "缺少 series_id 参数",
    });
  }

  const sql = "DELETE FROM series WHERE series_id = ?";
  db.query(sql, [series_id], (err, result) => {
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
        message: "分组不存在",
      });
    }
    return res.send({
      status: 200,
      message: "删除成功",
    });
  });
};
