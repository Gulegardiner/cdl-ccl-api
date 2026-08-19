const db = require("../db/index");
const jwt = require("jsonwebtoken");
const jwtconfig = require("../jwt_config/index.js");

// 从请求中解析当前用户信息
function getUserFromRequest(req) {
  if (req.auth && req.auth.account) {
    return {
      account: req.auth.account,
      identity: req.auth.identity || "user",
      nickname: req.auth.nickname || "",
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
          nickname: decoded.nickname || "",
        };
      }
    } catch (e) {
      // 忽略无效或过期 token
    }
  }
  return null;
}

// 1. 创建用户日志
exports.createLog = (req, res) => {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) {
    return res.send({ status: 401, message: "请重新登录" });
  }

  const { action, detail } = req.body || {};
  if (!action || !action.trim()) {
    return res.send({ status: 400, message: "操作类型不能为空" });
  }
  if (!detail || !detail.trim()) {
    return res.send({ status: 400, message: "操作详情不能为空" });
  }

  const logData = {
    account: currentUser.account,
    nickname: currentUser.nickname || null,
    role: currentUser.identity || "user",
    action: action.trim(),
    detail: detail.trim(),
    create_time: new Date(),
  };

  const sql = "INSERT INTO user_logs SET ?";
  db.query(sql, logData, (err, result) => {
    if (err) return res.cc(err);
    res.send({
      status: 200,
      message: "记录日志成功",
      data: {
        id: result.insertId,
      },
    });
  });
};

// 2. 分页获取用户日志列表
exports.getLogList = (req, res) => {
  const currentUser = getUserFromRequest(req);
  if (!currentUser) {
    return res.send({ status: 401, message: "请重新登录" });
  }

  let { page = 1, limit = 10, action } = req.body || {};
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.max(1, Math.min(50, parseInt(limit) || 10));
  const offset = (page - 1) * limit;

  // 权限鉴权逻辑：
  // 1. 如果是管理员或超管，查看所有管理员与超管的日志（role IN ('admin', 'superadmin')）
  // 2. 如果是普通用户，仅查看自己的日志（account = currentUser.account）
  let queryCond = "";
  let queryParams = [];

  if (["admin", "superadmin"].includes(currentUser.identity)) {
    queryCond = "role IN ('admin', 'superadmin')";
  } else {
    queryCond = "account = ?";
    queryParams.push(currentUser.account);
  }

  // 动作过滤
  if (action && action.trim()) {
    queryCond += " AND action = ?";
    queryParams.push(action.trim());
  }

  const countSql = `SELECT COUNT(*) AS total FROM user_logs WHERE ${queryCond}`;

  db.query(countSql, queryParams, (err, countResult) => {
    if (err) return res.cc(err);
    const total = countResult[0]?.total || 0;

    if (total === 0) {
      return res.send({
        status: 200,
        message: "获取日志成功",
        data: [],
        total: 0,
        page,
        limit,
      });
    }

    const listSql = `
      SELECT id, action, detail, create_time 
      FROM user_logs 
      WHERE ${queryCond} 
      ORDER BY create_time DESC 
      LIMIT ? OFFSET ?
    `;
    const listParams = [...queryParams, limit, offset];

    db.query(listSql, listParams, (listErr, rows) => {
      if (listErr) return res.cc(listErr);
      res.send({
        status: 200,
        message: "获取日志成功",
        data: rows,
        total,
        page,
        limit,
      });
    });
  });
};
