const db = require("../db/index");
const jwt = require("jsonwebtoken");
const jwtconfig = require("../jwt_config/index.js");

// 解析请求中的用户账号
function getAccountFromRequest(req) {
  if (req.auth && req.auth.account) {
    return req.auth.account;
  }
  if (req.body && req.body.account) {
    return req.body.account;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, jwtconfig.jwtSecretKey);
      if (decoded && decoded.account) {
        return decoded.account;
      }
    } catch (e) {
      // 忽略无效或过期的 token
    }
  }
  return null;
}


// 获取卡片列表（支持按 book_id 或 series_id 筛选和分页）
exports.getCardList = (req, res) => {
  let { page, limit, book_id, series_id, keyword } = req.body;
  const queryConditions = [];
  const queryValues = [];

  const userAccount = getAccountFromRequest(req);
  if (userAccount) {
    queryValues.push(userAccount);
  }

  if (book_id) {
    queryConditions.push("c.book_id = ?");
    queryValues.push(book_id);
  }
  if (series_id) {
    queryConditions.push("c.series_id = ?");
    queryValues.push(series_id);
  }
  if (keyword) {
    queryConditions.push("(c.name LIKE ? OR c.series_name LIKE ? OR c.note LIKE ?)");
    queryValues.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  let sql = "";
  if (userAccount) {
    sql = "SELECT c.*, COALESCE(uc.owned_count, 0) AS owned_count FROM cards c LEFT JOIN user_cards uc ON c.card_id = uc.card_id AND uc.account = ?";
  } else {
    sql = "SELECT c.*, 0 AS owned_count FROM cards c";
  }

  if (queryConditions.length) {
    sql += ` WHERE ${queryConditions.join(" AND ")}`;
  }
  sql += " ORDER BY c.created_at ASC";

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

  const userAccount = getAccountFromRequest(req);
  let sql;
  let queryValues;
  if (userAccount) {
    sql = "SELECT c.*, COALESCE(uc.owned_count, 0) AS owned_count FROM cards c LEFT JOIN user_cards uc ON c.card_id = uc.card_id AND uc.account = ? WHERE c.card_id = ?";
    queryValues = [userAccount, card_id];
  } else {
    sql = "SELECT c.*, 0 AS owned_count FROM cards c WHERE c.card_id = ?";
    queryValues = [card_id];
  }

  db.query(sql, queryValues, (err, result) => {
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
          owned_count: 0,
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

          // 如果存在账户并且指定了拥有数量，则写入用户关系表
          const userAccount = getAccountFromRequest(req) || account;
          if (userAccount && owned_count !== undefined) {
            const insertRelationSql = "INSERT INTO user_cards (account, card_id, owned_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?)";
            db.query(insertRelationSql, [userAccount, card_id, owned_count || 0, now, now], (err) => {
              if (err) return res.cc(err);
              return res.send({
                status: 200,
                message: "新增卡片成功",
              });
            });
          } else {
            return res.send({
              status: 200,
              message: "新增卡片成功",
            });
          }
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

  const userAccount = getAccountFromRequest(req);
  let ownedCountUpdatePromise = null;

  // 如果修改了 owned_count，从 fields 中剥离并单独更新 user_cards 表
  if ('owned_count' in fields) {
    const owned_count = Number(fields.owned_count);
    delete fields.owned_count;

    if (!userAccount) {
      return res.send({
        status: 400,
        message: "未登录或未指定账户，无法修改卡片拥有数",
      });
    }

    ownedCountUpdatePromise = new Promise((resolve, reject) => {
      const checkSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
      db.query(checkSql, [userAccount, card_id], (err, results) => {
        if (err) return reject(err);
        const now = Date.now();
        if (results.length > 0) {
          const updateSql = "UPDATE user_cards SET owned_count = ?, updated_at = ? WHERE account = ? AND card_id = ?";
          db.query(updateSql, [owned_count, now, userAccount, card_id], (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
        } else {
          const insertSql = "INSERT INTO user_cards (account, card_id, owned_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?)";
          db.query(insertSql, [userAccount, card_id, owned_count, now, now], (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
        }
      });
    });
  }

  function finishUpdate() {
    if (Object.keys(fields).length === 0) {
      if (ownedCountUpdatePromise) {
        return res.send({
          status: 200,
          message: "更新卡片拥有数量成功",
        });
      } else {
        return res.send({
          status: 400,
          message: "未提供任何需要更新的字段",
        });
      }
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
      // 如果修改了 series_id，检查新分组是否存在，并同步更新 series_name
      if ('series_id' in fields) {
        const sId = fields.series_id;
        if (!sId || sId === 'none' || sId === '') {
          fields.series_id = null;
          fields.series_name = null;
          doUpdate();
        } else {
          const seriesSql = "SELECT * FROM series WHERE series_id = ?";
          db.query(seriesSql, [sId], (err, seriesResults) => {
            if (err) return res.cc(err);
            if (seriesResults.length === 0) {
              return res.send({
                status: 400,
                message: "关联的分组不存在",
              });
            }
            fields.series_name = seriesResults[0].name;
            doUpdate();
          });
        }
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
  }

  if (ownedCountUpdatePromise) {
    ownedCountUpdatePromise
      .then(() => {
        finishUpdate();
      })
      .catch((err) => {
        res.cc(err);
      });
  } else {
    finishUpdate();
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

    // 将该卡片所有用户的拥有关系记录标记为已删除（is_delete = 1）
    const updateRelationSql = "UPDATE user_cards SET is_delete = 1 WHERE card_id = ?";
    db.query(updateRelationSql, [card_id], (err) => {
      if (err) console.error("Failed to update user_cards relationships:", err);
      return res.send({
        status: 200,
        message: "删除成功",
      });
    });
  });
};

// 获取当前用户的所有拥有卡片关系列表
exports.getUserCardList = (req, res) => {
  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法获取拥有卡片数据",
    });
  }

  const sql = "SELECT * FROM user_cards WHERE account = ?";
  db.query(sql, [userAccount], (err, result) => {
    if (err) {
      return res.send({
        status: 500,
        message: "数据库查询失败",
        error: err,
      });
    }
    return res.send({
      status: 200,
      message: "获取用户卡片关系成功",
      data: result,
    });
  });
};

// 直接更新或新增卡片拥有数
exports.updateUserCard = (req, res) => {
  const { card_id, owned_count } = req.body;
  if (!card_id || owned_count === undefined) {
    return res.send({
      status: 400,
      message: "缺少 card_id 或 owned_count 参数",
    });
  }

  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法更新拥有卡片数据",
    });
  }

  const checkSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
  db.query(checkSql, [userAccount, card_id], (err, results) => {
    if (err) return res.cc(err);
    const now = Date.now();
    if (results.length > 0) {
      const updateSql = "UPDATE user_cards SET owned_count = ?, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [owned_count, now, userAccount, card_id], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "更新卡片拥有数量成功",
        });
      });
    } else {
      const insertSql = "INSERT INTO user_cards (account, card_id, owned_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?)";
      db.query(insertSql, [userAccount, card_id, owned_count, now, now], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "新增卡片拥有关系成功",
        });
      });
    }
  });
};

// 点亮卡片
exports.litCard = (req, res) => {
  const { card_id } = req.body;
  if (!card_id) {
    return res.send({
      status: 400,
      message: "缺少 card_id 参数",
    });
  }

  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法点亮卡片",
    });
  }

  const checkSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
  db.query(checkSql, [userAccount, card_id], (err, results) => {
    if (err) return res.cc(err);
    const now = Date.now();
    if (results.length > 0) {
      if (results[0].owned_count > 0) {
        return res.send({
          status: 200,
          message: "卡片已点亮",
        });
      }
      const updateSql = "UPDATE user_cards SET owned_count = 1, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [now, userAccount, card_id], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "点亮卡片成功",
        });
      });
    } else {
      const insertSql = "INSERT INTO user_cards (account, card_id, owned_count, created_at, updated_at) VALUES (?, ?, 1, ?, ?)";
      db.query(insertSql, [userAccount, card_id, now, now], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "点亮卡片成功",
        });
      });
    }
  });
};

// 取消点亮卡片
exports.unlitCard = (req, res) => {
  const { card_id } = req.body;
  if (!card_id) {
    return res.send({
      status: 400,
      message: "缺少 card_id 参数",
    });
  }

  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法取消点亮卡片",
    });
  }

  const checkSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
  db.query(checkSql, [userAccount, card_id], (err, results) => {
    if (err) return res.cc(err);
    const now = Date.now();
    if (results.length > 0) {
      const updateSql = "UPDATE user_cards SET owned_count = 0, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [now, userAccount, card_id], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "取消点亮成功",
        });
      });
    } else {
      return res.send({
        status: 200,
        message: "取消点亮成功",
      });
    }
  });
};

