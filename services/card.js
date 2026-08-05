const db = require("../db/index");
const jwt = require("jsonwebtoken");
const jwtconfig = require("../jwt_config/index.js");
const fs = require("fs");
const path = require("path");

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
  let { page, limit, book_id, series_id, keyword, creater_name, creater_account, rarity, name } = req.body;
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
    const rawWords = keyword.trim().split(/\s+/);
    const tokens = [];
    for (const word of rawWords) {
      if (!word) continue;
      const segments = word.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9]+/g);
      if (segments && segments.length > 0) {
        tokens.push(...segments);
      } else {
        tokens.push(word);
      }
    }

    if (tokens.length > 0) {
      const conditions = [];
      tokens.forEach(token => {
        conditions.push("(c.name LIKE ? OR c.series_name LIKE ? OR c.note LIKE ? OR c.creater_name LIKE ?)");
        queryValues.push(`%${token}%`, `%${token}%`, `%${token}%`, `%${token}%`);
      });
      queryConditions.push(`(${conditions.join(" AND ")})`);
    }
  }
  if (creater_account) {
    queryConditions.push("c.creater_account = ?");
    queryValues.push(creater_account);
  }
  if (rarity) {
    queryConditions.push("c.rarity = ?");
    queryValues.push(rarity);
  }
  if (name) {
    queryConditions.push("c.name LIKE ?");
    queryValues.push(`%${name}%`);
  }

  let sql = "";
  if (userAccount) {
    sql = "SELECT c.*, COALESCE(uc.owned_count, 0) AS owned_count, COALESCE(uc.is_liked, 0) AS is_liked, COALESCE(uc.un_want, 0) AS un_want, COALESCE(uc.already_changed, 0) AS already_changed FROM cards c LEFT JOIN user_cards uc ON c.card_id = uc.card_id AND uc.account = ?";
  } else {
    sql = "SELECT c.*, 0 AS owned_count, 0 AS is_liked, 0 AS un_want, 0 AS already_changed FROM cards c";
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
    sql = "SELECT c.*, COALESCE(uc.owned_count, 0) AS owned_count, COALESCE(uc.is_liked, 0) AS is_liked, COALESCE(uc.un_want, 0) AS un_want, COALESCE(uc.already_changed, 0) AS already_changed FROM cards c LEFT JOIN user_cards uc ON c.card_id = uc.card_id AND uc.account = ? WHERE c.card_id = ?";
    queryValues = [userAccount, card_id];
  } else {
    sql = "SELECT c.*, 0 AS owned_count, 0 AS is_liked, 0 AS un_want, 0 AS already_changed FROM cards c WHERE c.card_id = ?";
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
    creater_name,
    creater_account,
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
          creater_name: creater_name || null,
          creater_account: creater_account || null,
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
    const reason = fields.reason;
    delete fields.owned_count;
    delete fields.reason;

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
          const old_owned_count = results[0].owned_count || 0;
          const current_un_want = results[0].un_want || 0;
          const current_already_changed = results[0].already_changed || 0;
          let new_un_want = current_un_want;
          let new_already_changed = current_already_changed;
          if (owned_count < old_owned_count) {
            const diff = old_owned_count - owned_count;
            if (reason === 'correction') {
              const res_un_want = current_un_want - diff;
              new_un_want = (owned_count > 0 && res_un_want < 1) ? 1 : Math.max(0, res_un_want);
              new_already_changed = current_already_changed;
            } else {
              new_un_want = Math.max(0, current_un_want - diff);
              new_already_changed = current_already_changed + diff;
            }
          }
          const updateSql = "UPDATE user_cards SET owned_count = ?, un_want = ?, already_changed = ?, updated_at = ? WHERE account = ? AND card_id = ?";
          db.query(updateSql, [owned_count, new_un_want, new_already_changed, now, userAccount, card_id], (err, result) => {
            if (err) return reject(err);
            resolve(result);
          });
        } else {
          const insertSql = "INSERT INTO user_cards (account, card_id, owned_count, un_want, already_changed, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)";
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

// 辅助函数：安全删除服务器上的文件
const deleteFile = (urlPath) => {
  if (!urlPath) return;
  try {
    // 1. 去除 URL 中的查询参数和 hash (例如 ?t=123456 或 #hash)
    let cleanPath = urlPath.split("?")[0].split("#")[0];

    // 2. 如果是完整的 URL (以 http:// 或 https:// 开头)，提取其 pathname
    if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
      try {
        cleanPath = new URL(cleanPath).pathname;
      } catch (e) {
        const match = cleanPath.match(/^https?:\/\/[^\/]+(\/.*)$/);
        if (match) cleanPath = match[1];
      }
    }

    // 3. 构建绝对路径
    const basePublicDir = path.resolve(__dirname, "../public");
    const absolutePath = path.join(basePublicDir, cleanPath);

    // 写入 debug 日志到文件，以便查阅
    try {
      fs.appendFileSync(
        path.join(__dirname, "../delete_debug.log"),
        `[${new Date().toLocaleString()}] deleteFile:\n- 原 urlPath: ${urlPath}\n- 清理后 cleanPath: ${cleanPath}\n- 解析绝对路径 absolutePath: ${absolutePath}\n- 是否存在: ${fs.existsSync(absolutePath)}\n`
      );
    } catch (_) {}

    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      try {
        fs.appendFileSync(path.join(__dirname, "../delete_debug.log"), `- 成功删除文件\n\n`);
      } catch (_) {}
    } else {
      try {
        fs.appendFileSync(path.join(__dirname, "../delete_debug.log"), `- 文件不存在，跳过删除\n\n`);
      } catch (_) {}
    }
  } catch (err) {
    console.error(`Failed to delete file ${urlPath}:`, err);
    try {
      fs.appendFileSync(
        path.join(__dirname, "../delete_debug.log"),
        `Error deleting ${urlPath}: ${err.stack}\n\n`
      );
    } catch (_) {}
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

  // 1. 先查询卡片数据获取图片路径
  const selectSql = "SELECT image_url, back_image_url FROM cards WHERE card_id = ?";
  db.query(selectSql, [card_id], (err, results) => {
    if (err) {
      return res.send({
        status: 500,
        message: "数据库查询失败",
        error: err,
      });
    }
    if (results.length === 0) {
      return res.send({
        status: 404,
        message: "卡片不存在",
      });
    }

    const { image_url, back_image_url } = results[0];

    // 2. 执行删除卡片记录
    const deleteSql = "DELETE FROM cards WHERE card_id = ?";
    db.query(deleteSql, [card_id], (err, result) => {
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

      // 3. 删除服务器本地对应的图片文件
      deleteFile(image_url);
      deleteFile(back_image_url);

      // 4. 将该卡片所有用户的拥有关系记录标记为已删除（is_delete = 1）
      const updateRelationSql = "UPDATE user_cards SET is_delete = 1 WHERE card_id = ?";
      db.query(updateRelationSql, [card_id], (err) => {
        if (err) console.error("Failed to update user_cards relationships:", err);
        return res.send({
          status: 200,
          message: "删除成功",
        });
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
  const { card_id, owned_count, reason } = req.body;
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
      const old_owned_count = results[0].owned_count || 0;
      const current_un_want = results[0].un_want || 0;
      const current_already_changed = results[0].already_changed || 0;
      let new_un_want = current_un_want;
      let new_already_changed = current_already_changed;
      if (owned_count < old_owned_count) {
        const diff = old_owned_count - owned_count;
        if (reason === 'correction') {
          const res_un_want = current_un_want - diff;
          new_un_want = (owned_count > 0 && res_un_want < 1) ? 1 : Math.max(0, res_un_want);
          new_already_changed = current_already_changed;
        } else {
          new_un_want = Math.max(0, current_un_want - diff);
          new_already_changed = current_already_changed + diff;
        }
      }
      const updateSql = "UPDATE user_cards SET owned_count = ?, un_want = ?, already_changed = ?, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [owned_count, new_un_want, new_already_changed, now, userAccount, card_id], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "更新卡片拥有数量成功",
        });
      });
    } else {
      const insertSql = "INSERT INTO user_cards (account, card_id, owned_count, un_want, already_changed, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)";
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
  const { card_id, reason } = req.body;
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
      const old_owned_count = results[0].owned_count || 0;
      const current_un_want = results[0].un_want || 0;
      const current_already_changed = results[0].already_changed || 0;
      let new_un_want = current_un_want;
      let new_already_changed = current_already_changed;
      if (0 < old_owned_count) {
        const diff = old_owned_count;
        const dec_un_want = Math.min(diff, current_un_want);
        new_un_want = current_un_want - dec_un_want;
        if (reason !== 'correction') {
          new_already_changed = current_already_changed + diff;
        }
      }
      const updateSql = "UPDATE user_cards SET owned_count = 0, un_want = ?, already_changed = ?, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [new_un_want, new_already_changed, now, userAccount, card_id], (err, result) => {
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

// 喜欢卡片
exports.likeCard = (req, res) => {
  const { card_id, count } = req.body;
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
      message: "未登录",
    });
  }

  const targetCount = (count !== undefined && count !== null) ? parseInt(count, 10) : 1;

  const checkSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
  db.query(checkSql, [userAccount, card_id], (err, results) => {
    if (err) return res.cc(err);
    const now = Date.now();
    if (results.length > 0) {
      const updateSql = "UPDATE user_cards SET is_liked = ?, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [targetCount, now, userAccount, card_id], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "喜欢卡片成功",
        });
      });
    } else {
      const insertSql = "INSERT INTO user_cards (account, card_id, is_liked, created_at, updated_at) VALUES (?, ?, ?, ?, ?)";
      db.query(insertSql, [userAccount, card_id, targetCount, now, now], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "喜欢卡片成功",
        });
      });
    }
  });
};

// 取消喜欢卡片
exports.unlikeCard = (req, res) => {
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
      message: "未登录，无法取消喜欢卡片",
    });
  }

  const checkSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
  db.query(checkSql, [userAccount, card_id], (err, results) => {
    if (err) return res.cc(err);
    const now = Date.now();
    if (results.length > 0) {
      const updateSql = "UPDATE user_cards SET is_liked = 0, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [now, userAccount, card_id], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "取消喜欢成功",
        });
      });
    } else {
      return res.send({
        status: 200,
        message: "取消喜欢成功",
      });
    }
  });
};

// 标记为不想要
exports.unwantCard = (req, res) => {
  const { card_id, count } = req.body;
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
      message: "未登录，无法标记为不想要",
    });
  }

  const targetCount = (count !== undefined && count !== null) ? parseInt(count, 10) : 1;

  const checkSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
  db.query(checkSql, [userAccount, card_id], (err, results) => {
    if (err) return res.cc(err);
    const now = Date.now();
    if (results.length > 0) {
      const updateSql = "UPDATE user_cards SET un_want = ?, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [targetCount, now, userAccount, card_id], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "标记为不想要成功",
        });
      });
    } else {
      const insertSql = "INSERT INTO user_cards (account, card_id, un_want, created_at, updated_at) VALUES (?, ?, ?, ?, ?)";
      db.query(insertSql, [userAccount, card_id, targetCount, now, now], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "标记为不想要成功",
        });
      });
    }
  });
};

// 取消不想要标记
exports.cancelUnwantCard = (req, res) => {
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
      message: "未登录，无法取消不想要标记",
    });
  }

  const checkSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
  db.query(checkSql, [userAccount, card_id], (err, results) => {
    if (err) return res.cc(err);
    const now = Date.now();
    if (results.length > 0) {
      const updateSql = "UPDATE user_cards SET un_want = 0, updated_at = ? WHERE account = ? AND card_id = ?";
      db.query(updateSql, [now, userAccount, card_id], (err, result) => {
        if (err) return res.cc(err);
        return res.send({
          status: 200,
          message: "取消不想要标记成功",
        });
      });
    } else {
      return res.send({
        status: 200,
        message: "取消不想要标记成功",
      });
    }
  });
};

// 保存文字识别历史导入记录
exports.saveImportHistory = (req, res) => {
  const { unite_bookid, historyList } = req.body;
  if (!unite_bookid) {
    return res.send({
      status: 400,
      message: "缺少 unite_bookid 参数",
    });
  }
  if (!historyList || !Array.isArray(historyList) || historyList.length === 0) {
    return res.send({
      status: 200,
      message: "没有需要保存的历史记录",
    });
  }

  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法保存历史导入记录",
    });
  }

  const now = Date.now();
  const values = historyList.map(item => [
    userAccount,
    unite_bookid,
    item.card_code,
    item.record_time,
    now
  ]);

  const sql = "INSERT IGNORE INTO user_text_import_history (account, unite_bookid, card_code, record_time, created_at) VALUES ?";
  db.query(sql, [values], (err, result) => {
    if (err) return res.cc(err);
    return res.send({
      status: 200,
      message: "保存导入历史成功",
    });
  });
};

// 获取已有的文字识别历史导入记录
exports.getImportHistory = (req, res) => {
  const { unite_bookid } = req.body;
  if (!unite_bookid) {
    return res.send({
      status: 400,
      message: "缺少 unite_bookid 参数",
    });
  }

  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法获取导入历史记录",
    });
  }

  const sql = "SELECT card_code, record_time FROM user_text_import_history WHERE account = ? AND unite_bookid = ?";
  db.query(sql, [userAccount, unite_bookid], (err, results) => {
    if (err) return res.cc(err);
    return res.send({
      status: 200,
      message: "获取导入历史成功",
      data: results
    });
  });
};

// 清空当前用户的所有点亮记录、收换卡记录以及导入历史记录
exports.clearUserCards = (req, res) => {
  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法清空记录",
    });
  }

  // 1. 删除用户卡片拥有关系记录
  const sql1 = "DELETE FROM user_cards WHERE account = ?";
  db.query(sql1, [userAccount], (err, result) => {
    if (err) {
      return res.send({
        status: 500,
        message: "数据库操作失败(user_cards)",
        error: err,
      });
    }

    // 2. 删除文字识别导入历史记录
    const sql2 = "DELETE FROM user_text_import_history WHERE account = ?";
    db.query(sql2, [userAccount], (err, result) => {
      if (err) {
        return res.send({
          status: 500,
          message: "数据库操作失败(user_text_import_history)",
          error: err,
        });
      }

      return res.send({
        status: 200,
        message: "清空所有记录和导入历史成功",
      });
    });
  });
};


