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

// 解析 book_id（支持逗号分隔多个）
function parseBookIds(book_id) {
  if (!book_id) return [];
  return String(book_id)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// 1. 创建标签（接收 book_id，如果包含多个则保存第一个或处理；支持 color 和 is_universal 字段）
exports.createCollectTag = (req, res) => {
  const { tagName, book_id, color, is_universal } = req.body;
  if (!tagName || !tagName.trim()) {
    return res.send({
      status: 400,
      message: "标签名称不能为空",
    });
  }

  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法创建标签",
    });
  }

  const presets = [
    'magenta',
    'red',
    'volcano',
    'orange',
    'gold',
    'lime',
    'green',
    'cyan',
    'blue',
    'geekblue',
    'purple',
  ];

  let tagColor = color;
  if (!tagColor || !tagColor.trim()) {
    tagColor = presets[Math.floor(Math.random() * presets.length)];
  } else {
    tagColor = tagColor.trim();
  }

  const tagId = `${userAccount}_${Date.now()}`;
  const now = new Date();
  const bookIdVal = book_id ? String(book_id).trim() : null;
  const isUniversalVal = is_universal ? 1 : 0;

  const sql = "INSERT INTO collect_tags (tagId, tagName, color, create_account, book_id, create_time, is_universal) VALUES (?, ?, ?, ?, ?, ?, ?)";
  db.query(sql, [tagId, tagName.trim(), tagColor, userAccount, bookIdVal, now, isUniversalVal], (err, result) => {
    if (err) {
      return res.send({
        status: 500,
        message: "创建标签失败",
        error: err,
      });
    }
    return res.send({
      status: 200,
      message: "创建标签成功",
      data: {
        tagId,
        tagName: tagName.trim(),
        color: tagColor,
        create_account: userAccount,
        book_id: bookIdVal,
        create_time: now,
        is_universal: isUniversalVal,
      },
    });
  });
};

// 2. 获取当前用户标签列表（可根据 book_id 过滤，支持逗号分隔多个 book_id，包含已换出卡片总张数统计，包含通用标签）
exports.getCollectTagList = (req, res) => {
  const { book_id } = req.body;
  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法获取标签列表",
    });
  }

  const bookIds = parseBookIds(book_id);
  let bookFilterSql = "";
  const queryParams = [userAccount, userAccount];

  if (bookIds.length === 1) {
    bookFilterSql = " AND (t.is_universal = 1 OR t.book_id = ? OR FIND_IN_SET(?, t.book_id) > 0)";
    queryParams.push(bookIds[0], bookIds[0]);
  } else if (bookIds.length > 1) {
    const conditions = bookIds.map(() => "(t.book_id = ? OR FIND_IN_SET(?, t.book_id) > 0)").join(" OR ");
    bookFilterSql = ` AND (t.is_universal = 1 OR ${conditions})`;
    bookIds.forEach((bId) => queryParams.push(bId, bId));
  }

  const sql = `
    SELECT 
      t.tagId, 
      t.tagName, 
      t.color,
      t.create_account, 
      t.book_id,
      t.create_time,
      t.is_universal,
      COALESCE(SUM(ect.exchange_count), 0) AS total_exchange_count,
      COUNT(DISTINCT ect.card_id) AS total_card_types
    FROM collect_tags t
    LEFT JOIN collect_card_tags ect ON t.tagId = ect.tagId AND ect.account = ?
    WHERE t.create_account = ?${bookFilterSql}
    GROUP BY t.tagId, t.tagName, t.color, t.create_account, t.book_id, t.create_time, t.is_universal
    ORDER BY t.create_time DESC
  `;

  db.query(sql, queryParams, (err, results) => {
    if (err) {
      return res.send({
        status: 500,
        message: "获取标签列表失败",
        error: err,
      });
    }
    return res.send({
      status: 200,
      message: "获取标签列表成功",
      data: results,
    });
  });
};

// 3. 修改标签名称、颜色与通用标志 (使用 tagId 操作)
exports.updateCollectTag = (req, res) => {
  const { tagId, tagName, color, is_universal, book_id } = req.body;
  if (!tagId || !tagName || !tagName.trim()) {
    return res.send({
      status: 400,
      message: "缺少 tagId 或 tagName 参数",
    });
  }

  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法更新标签",
    });
  }

  // 先查询原标签信息
  db.query("SELECT book_id, is_universal FROM collect_tags WHERE tagId = ? AND create_account = ?", [tagId, userAccount], (findErr, findRows) => {
    if (findErr || findRows.length === 0) {
      return res.send({
        status: 404,
        message: "未找到对应的标签或无权限修改",
      });
    }

    const oldTag = findRows[0];
    const oldIsUniversal = oldTag.is_universal;
    const selectBookid = book_id;

    const updateFields = ["tagName = ?"];
    const queryParams = [tagName.trim()];

    if (color !== undefined) {
      updateFields.push("color = ?");
      queryParams.push(color ? color.trim() : null);
    }

    if (is_universal !== undefined) {
      updateFields.push("is_universal = ?");
      queryParams.push(is_universal ? 1 : 0);
    }

    if (book_id !== undefined) {
      updateFields.push("book_id = ?");
      queryParams.push(book_id ? book_id.trim() : null);
    }

    queryParams.push(tagId, userAccount);

    const sql = `UPDATE collect_tags SET ${updateFields.join(", ")} WHERE tagId = ? AND create_account = ?`;
    db.query(sql, queryParams, (err, result) => {
      if (err) {
        return res.send({
          status: 500,
          message: "更新标签失败",
          error: err,
        });
      }
      if (result.affectedRows === 0) {
        return res.send({
          status: 404,
          message: "未找到对应的标签或无权限修改",
        });
      }

      // 如果由通用标签 (is_universal = 1) 改为了私有标签 (is_universal = 0)，
      // 除了传入的选中卡池，清理其他卡池下该标签的关联记录
      if (oldIsUniversal === 1 && is_universal === 0) {
        // selectBookid 可能是单个 book_id，也可能是逗号分隔的多个 book_id (如: "book_1,book_2")
        const selectBookIds = String(selectBookid)
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);

        if (selectBookIds.length > 0) {
          const inPlaceholders = selectBookIds.map(() => "?").join(",");
          const findBooksSql = `SELECT book_id FROM unite_books WHERE unite_bookid IN (${inPlaceholders}) UNION SELECT book_id FROM books WHERE unite_bookid IN (${inPlaceholders})`;
          const queryParams = [...selectBookIds, ...selectBookIds];

          db.query(findBooksSql, queryParams, (bErr, bRows) => {
            let validBookIds = [...selectBookIds];
            if (!bErr && bRows && bRows.length > 0) {
              const ids = bRows.map((r) => r.book_id).filter(Boolean);
              if (ids.length > 0) {
                validBookIds = Array.from(new Set([...validBookIds, ...ids]));
              }
            }

            const placeholders = validBookIds.map(() => "?").join(",");
            const cleanSql = `DELETE FROM collect_card_tags WHERE tagId = ? AND account = ? AND book_id NOT IN (${placeholders})`;
            db.query(cleanSql, [tagId, userAccount, ...validBookIds], (cleanErr) => {
              if (cleanErr) {
                console.error("清理跨卡池标签关联失败:", cleanErr);
              }
            });
          });
        }
      }

      return res.send({
        status: 200,
        message: "修改标签成功",
      });
    });
  });
};

// 4. 删除标签 (使用 tagId 操作，接收可选的 book_id 区分创建归属卡池与非归属卡池)
exports.deleteCollectTag = (req, res) => {
  const { tagId, book_id } = req.body;
  if (!tagId) {
    return res.send({
      status: 400,
      message: "缺少 tagId 参数",
    });
  }

  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法删除标签",
    });
  }

  // 先查询标签详情
  const queryTagSql = "SELECT * FROM collect_tags WHERE tagId = ? AND create_account = ?";
  db.query(queryTagSql, [tagId, userAccount], (findErr, findRows) => {
    if (findErr) {
      return res.send({
        status: 500,
        message: "查询标签失败",
        error: findErr,
      });
    }

    if (!findRows || findRows.length === 0) {
      return res.send({
        status: 404,
        message: "未找到对应的标签或无权限删除",
      });
    }

    const tag = findRows[0];
    const creatorBookId = tag.book_id;
    const currentBookId = book_id ? String(book_id).trim() : "";

    // 判断是否在创建归属卡池进行删除
    let isCreatorPool = true;
    if (currentBookId && creatorBookId) {
      const creatorIds = parseBookIds(creatorBookId);
      const currentIds = parseBookIds(currentBookId);
      const hasOverlap = creatorIds.some((id) => currentIds.includes(id)) || (creatorBookId === currentBookId);
      if (!hasOverlap) {
        isCreatorPool = false;
      }
    }

    if (!isCreatorPool) {
      // 非创建归属卡池：只清理当前合集卡池（包含其下所有细分卡池）与该标签在 collect_card_tags 中的关联记录
      const currentIds = parseBookIds(currentBookId);
      const inPlaceholders = currentIds.map(() => "?").join(",");
      const findBooksSql = `SELECT book_id FROM unite_book WHERE unite_bookid IN (${inPlaceholders}) UNION SELECT book_id FROM books WHERE unite_bookid IN (${inPlaceholders}) OR book_id IN (${inPlaceholders})`;
      const queryParams = [...currentIds, ...currentIds];

      db.query(findBooksSql, queryParams, (bErr, bRows) => {
        let validBookIds = [...currentIds];
        if (!bErr && bRows && bRows.length > 0) {
          const ids = bRows.map((r) => r.book_id).filter(Boolean);
          if (ids.length > 0) {
            validBookIds = Array.from(new Set([...validBookIds, ...ids]));
          }
        }

        const placeholders = validBookIds.map(() => "?").join(",");
        const cleanSql = `DELETE FROM collect_card_tags WHERE tagId = ? AND account = ? AND (book_id IN (${placeholders}) OR card_id IN (SELECT card_id FROM cards WHERE book_id IN (${placeholders})))`;
        db.query(cleanSql, [tagId, userAccount, ...validBookIds, ...validBookIds], (cleanErr) => {
          if (cleanErr) {
            return res.send({
              status: 500,
              message: "移除当前卡池标签关联失败",
              error: cleanErr,
            });
          }
          return res.send({
            status: 200,
            message: "已移除当前卡池的标签关联，小卡已移至未打标",
          });
        });
      });
    } else {
      // 创建归属卡池：彻底删除标签并清理所有卡池关联
      const deleteTagSql = "DELETE FROM collect_tags WHERE tagId = ? AND create_account = ?";
      db.query(deleteTagSql, [tagId, userAccount], (err, result) => {
        if (err) {
          return res.send({
            status: 500,
            message: "删除标签失败",
            error: err,
          });
        }

        // 清理 collect_card_tags 关联关系
        const deleteRelationSql = "DELETE FROM collect_card_tags WHERE tagId = ? AND account = ?";
        db.query(deleteRelationSql, [tagId, userAccount], (delRelErr) => {
          if (delRelErr) {
            console.error("清理 collect_card_tags 关联失败:", delRelErr);
          }
          return res.send({
            status: 200,
            message: "删除标签成功",
          });
        });
      });
    }
  });
};

// 5. 获取收卡卡片的标签关联列表（可根据 book_id 过滤，支持逗号分隔多个 book_id）
exports.getCollectCardTags = (req, res) => {
  const { book_id } = req.body;
  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法获取换出卡片标签关联",
    });
  }

  const bookIds = parseBookIds(book_id);
  let sql = "SELECT * FROM collect_card_tags WHERE account = ?";
  const queryParams = [userAccount];

  if (bookIds.length === 1) {
    sql += " AND book_id = ?";
    queryParams.push(bookIds[0]);
  } else if (bookIds.length > 1) {
    const placeholders = bookIds.map(() => "?").join(",");
    sql += ` AND book_id IN (${placeholders})`;
    queryParams.push(...bookIds);
  }

  db.query(sql, queryParams, (err, results) => {
    if (err) {
      return res.send({
        status: 500,
        message: "查询换出卡片标签关联失败",
        error: err,
      });
    }
    return res.send({
      status: 200,
      message: "查询换出卡片标签关联成功",
      data: results,
    });
  });
};

// 6. 重新分配/更新某张小卡的标签打标记录 (tagAllocations: [{ tagId, exchange_count }])
exports.updateCollectCardTags = (req, res) => {
  const { card_id, book_id, tagAllocations } = req.body;
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
      message: "未登录，无法更新卡片标签关联",
    });
  }

  // 先获取卡片的 book_id
  const getBookIdSql = book_id ? Promise.resolve(book_id) : new Promise((resolve) => {
    db.query("SELECT book_id FROM cards WHERE card_id = ?", [card_id], (err, rows) => {
      if (!err && rows.length > 0) resolve(rows[0].book_id);
      else resolve('');
    });
  });

  getBookIdSql.then((bId) => {
    // 1. 删除该用户对该卡片原有的所有标签关联
    const deleteSql = "DELETE FROM collect_card_tags WHERE account = ? AND card_id = ?";
    db.query(deleteSql, [userAccount, card_id], (deleteErr) => {
      if (deleteErr) {
        return res.send({
          status: 500,
          message: "清除旧标签关联失败",
          error: deleteErr,
        });
      }

      // 过滤出 exchange_count > 0 的有效分配
      const validAllocations = Array.isArray(tagAllocations)
        ? tagAllocations.filter((item) => item.tagId && Number(item.exchange_count) > 0)
        : [];

      if (validAllocations.length === 0) {
        return res.send({
          status: 200,
          message: "更新卡片标签成功（已清空标签）",
        });
      }

      const now = new Date();
      const insertSql = "INSERT INTO collect_card_tags (tagId, account, book_id, card_id, exchange_count, create_time) VALUES ?";
      const values = validAllocations.map((item) => [
        item.tagId,
        userAccount,
        bId || '',
        card_id,
        Number(item.exchange_count),
        now,
      ]);

      db.query(insertSql, [values], (insertErr) => {
        if (insertErr) {
          return res.send({
            status: 500,
            message: "写入新标签关联失败",
            error: insertErr,
          });
        }
        return res.send({
          status: 200,
          message: "更新卡片标签成功",
        });
      });
    });
  });
};

// 7. 更新收卡小卡数量（支持在全部、未打标、特定标签下进行数量修正）
exports.updateCollectLikedCards = async (req, res) => {
  const { book_id, tagId, updates } = req.body;
  const userAccount = getAccountFromRequest(req);
  if (!userAccount) {
    return res.send({
      status: 401,
      message: "未登录，无法更新收卡小卡数据",
    });
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.send({
      status: 200,
      message: "没有需要更新的收卡小卡",
    });
  }

  const isSpecificTag = tagId && tagId !== "ALL" && tagId !== "UNTAGGED";
  const now = Date.now();
  const nowDate = new Date();

  try {
    const promises = updates.map((item) => {
      const card_id = item.card_id;
      const diff = Number(item.diff) || 0;
      const targetCount = Math.max(0, Number(item.targetCount) || 0);
      const cardBookId = item.book_id || book_id || "";

      if (!card_id || diff === 0) return Promise.resolve();

      return new Promise((resolve, reject) => {
        // 1. 先更新 user_cards 中的 is_liked 总数
        const checkUserCardSql = "SELECT * FROM user_cards WHERE account = ? AND card_id = ?";
        db.query(checkUserCardSql, [userAccount, card_id], (uErr, uRows) => {
          if (uErr) return reject(uErr);

          const updateUserCards = new Promise((resUc, rejUc) => {
            if (uRows && uRows.length > 0) {
              const currentLiked = uRows[0].is_liked || 0;
              const newLiked = Math.max(0, currentLiked + diff);
              const updateSql = "UPDATE user_cards SET is_liked = ?, updated_at = ? WHERE account = ? AND card_id = ?";
              db.query(updateSql, [newLiked, now, userAccount, card_id], (err) => {
                if (err) return rejUc(err);
                resUc();
              });
            } else {
              if (diff > 0) {
                const insertSql = "INSERT INTO user_cards (account, card_id, owned_count, is_liked, un_want, already_changed, created_at, updated_at) VALUES (?, ?, 0, ?, 0, 0, ?, ?)";
                db.query(insertSql, [userAccount, card_id, diff, now, now], (err) => {
                  if (err) return rejUc(err);
                  resUc();
                });
              } else {
                resUc();
              }
            }
          });

          updateUserCards
            .then(() => {
              // 2. 如果是具体自定义标签，同步更新 collect_card_tags 表
              if (isSpecificTag) {
                const checkTagSql = "SELECT * FROM collect_card_tags WHERE account = ? AND tagId = ? AND card_id = ?";
                db.query(checkTagSql, [userAccount, tagId, card_id], (tErr, tRows) => {
                  if (tErr) return reject(tErr);

                  if (targetCount > 0) {
                    if (tRows && tRows.length > 0) {
                      const updateTagCountSql = "UPDATE collect_card_tags SET exchange_count = ? WHERE account = ? AND tagId = ? AND card_id = ?";
                      db.query(updateTagCountSql, [targetCount, userAccount, tagId, card_id], (err) => {
                        if (err) return reject(err);
                        resolve();
                      });
                    } else {
                      // 查询 book_id
                      const getBookId = cardBookId
                        ? Promise.resolve(cardBookId)
                        : new Promise((resB) => {
                            db.query("SELECT book_id FROM cards WHERE card_id = ?", [card_id], (err, cRows) => {
                              if (!err && cRows && cRows.length > 0) resB(cRows[0].book_id);
                              else resB("");
                            });
                          });

                      getBookId.then((bId) => {
                        const insertTagSql = "INSERT INTO collect_card_tags (tagId, account, book_id, card_id, exchange_count, create_time) VALUES (?, ?, ?, ?, ?, ?)";
                        db.query(insertTagSql, [tagId, userAccount, bId || "", card_id, targetCount, nowDate], (err) => {
                          if (err) return reject(err);
                          resolve();
                        });
                      });
                    }
                  } else {
                    // targetCount <= 0，删除该标签记录
                    const deleteTagSql = "DELETE FROM collect_card_tags WHERE account = ? AND tagId = ? AND card_id = ?";
                    db.query(deleteTagSql, [userAccount, tagId, card_id], (err) => {
                      if (err) return reject(err);
                      resolve();
                    });
                  }
                });
              } else {
                resolve();
              }
            })
            .catch(reject);
        });
      });
    });

    await Promise.all(promises);
    return res.send({
      status: 200,
      message: "更新收卡小卡数量成功",
    });
  } catch (err) {
    console.error("更新收卡小卡数量失败:", err);
    return res.send({
      status: 500,
      message: "更新收卡小卡数量失败",
      error: err,
    });
  }
};

