const db = require("../db/index");

// 获取卡片列表（支持按 book_id 或 series_id 筛选和分页）
exports.getCardList = (req, res) => {
  let { page, limit, book_id, series_id, keyword } = req.body;
  const queryConditions = [];
  const queryValues = [];

  if (book_id) {
    queryConditions.push("book_id = ?");
    queryValues.push(book_id);
  }
  if (series_id) {
    queryConditions.push("series_id = ?");
    queryValues.push(series_id);
  }
  if (keyword) {
    queryConditions.push("(name LIKE ? OR series_name LIKE ? OR note LIKE ?)");
    queryValues.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  let sql = "SELECT * FROM cards";
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
        message: "获取卡片列表成功",
        data: result,
        total,
        pagination: page && limit ? { page, limit, total } : undefined,
      });
    });
  });
};

// 获取单个卡片详情
exports.getCardDetail = (req, res) => {
  const { card_id } = req.body;
  if (!card_id) {
    return res.send({
      status: 400,
      message: "缺少 card_id 参数",
    });
  }

  const sql = "SELECT * FROM cards WHERE card_id = ?";
  db.query(sql, card_id, (err, result) => {
    if (err) return res.cc(err);
    if (result.length === 0) {
      return res.send({
        status: 404,
        message: "卡片不存在",
      });
    }
    return res.send({
      status: 200,
      message: "获取卡片详情成功",
      data: result[0],
    });
  });
};

// 新增卡片
exports.createCard = (req, res) => {
  const {
    card_id,
    book_id,
    series_id,
    name,
    image_url,
    back_image_url,
    rarity,
    series_name,
    display_style,
    orientation,
    note,
    owned_count,
    onlyId,
    account,
  } = req.body;

  if (!card_id || !book_id || !name) {
    return res.send({
      status: 400,
      message: "card_id、book_id 和 name 不能为空",
    });
  }

  // 检查 card_id 是否已存在
  const checkSql = "SELECT * FROM cards WHERE card_id = ?";
  db.query(checkSql, card_id, (err, results) => {
    if (err) return res.cc(err);
    if (results.length > 0) {
      return res.send({
        status: 500,
        message: "卡片ID已存在",
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

      // 如果传了 series_id，检查关联的分组是否存在
      if (series_id) {
        const seriesSql = "SELECT * FROM series WHERE series_id = ?";
        db.query(seriesSql, series_id, (err, seriesResults) => {
          if (err) return res.cc(err);
          if (seriesResults.length === 0) {
            return res.send({
              status: 400,
              message: "关联的分组不存在",
            });
          }
          doInsert();
        });
      } else {
        doInsert();
      }
    });

    function doInsert() {
      const now = Date.now();
      const sql = "INSERT INTO cards SET ?";
      db.query(
        sql,
        {
          card_id,
          book_id,
          series_id: series_id || null,
          name,
          image_url: image_url || null,
          back_image_url: back_image_url || null,
          rarity: rarity || null,
          series_name: series_name || '',
          display_style: display_style || "card",
          orientation: orientation || "portrait",
          note: note || null,
          owned_count: owned_count || 0,
          onlyId: onlyId || null,
          account: account || null,
          created_at: now,
          updated_at: now,
        },
        (err, result) => {
          if (err) return res.cc(err);
          if (result.affectedRows !== 1) {
            return res.send({
              status: 500,
              message: "新增卡片失败",
            });
          }
          res.send({
            status: 200,
            message: "新增卡片成功",
          });
        }
      );
    }
  });
};

// 更新卡片
exports.updateCard = (req, res) => {
  const { card_id, ...fields } = req.body;

  if (!card_id) {
    return res.send({
      status: 400,
      message: "缺少 card_id 参数",
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
      checkSeriesAndUpdate();
    });
  } else {
    checkSeriesAndUpdate();
  }

  function checkSeriesAndUpdate() {
    // 如果修改了 series_id，检查新分组是否存在
    if (fields.series_id) {
      const seriesSql = "SELECT * FROM series WHERE series_id = ?";
      db.query(seriesSql, fields.series_id, (err, seriesResults) => {
        if (err) return res.cc(err);
        if (seriesResults.length === 0) {
          return res.send({
            status: 400,
            message: "关联的分组不存在",
          });
        }
        doUpdate();
      });
    } else {
      doUpdate();
    }
  }

  function doUpdate() {
    // 更新时间戳
    fields.updated_at = Date.now();

    const updates = Object.keys(fields)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = [...Object.values(fields), card_id];
    const sql = `UPDATE cards SET ${updates} WHERE card_id = ?`;

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
          message: "卡片不存在或未修改任何字段",
        });
      }
      return res.send({
        status: 200,
        message: "卡片更新成功",
      });
    });
  }
};

// 删除卡片
exports.deleteCard = (req, res) => {
  const { card_id } = req.body;

  if (!card_id) {
    return res.send({
      status: 400,
      message: "缺少 card_id 参数",
    });
  }

  const sql = "DELETE FROM cards WHERE card_id = ?";
  db.query(sql, [card_id], (err, result) => {
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
        message: "卡片不存在",
      });
    }
    return res.send({
      status: 200,
      message: "删除成功",
    });
  });
};
