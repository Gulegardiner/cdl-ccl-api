const db = require("../db/index");
const bcrypt = require("bcryptjs");

// 导入node.js的crypto库生成uuid
const crypto = require("crypto");
// 导入fs处理文件路径
const fs = require("fs");

// 上传头像
exports.uploadAvatar = (req, res) => {
  const onlyId = crypto.randomUUID();
  let oldName = req.files[0].filename;
  let newName = Buffer.from(req.files[0].originalname, "latin1").toString("utf8");
  // 更换名字
  fs.renameSync(
    "./public/uploads/avatars/" + oldName,
    "./public/uploads/avatars/" + newName
  );
  // 插到images表里
  const sql = "insert into images set ?";
  db.query(
    sql,
    {
      image_url: newName,
      onlyId,
    },
    (err, result) => {
      if (err) return res.cc(err);
      res.send({
        onlyId,
        status: 200,
        url: newName,
      });
    }
  );
};

// 绑定账号
exports.bindAccount = (req, res) => {
  const { account, onlyId, url } = req.body;
  const sql1 = "update users set image_url = ? where account = ?";
  db.query(sql1, [url, account], (err, result) => {
    if (err) return res.cc(err);
    res.send({
      status: 200,
      message: "修改成功",
    });
  });
};

// 获取用户信息 接收参数 account
exports.getUserInfo = (req, res) => {
  const sql = "select * from users where account = ?";
  db.query(sql, req.body.account, (err, result) => {
    if (err) return res.cc(err);
    result[0].password = "*";
    return res.send({ ...result[0], status: 200 });
  });
};

exports.updateUserInfo = (req, res) => {
  const { account, ...fields } = req.body;
  if (!account) {
    return res.send({
      status: 400,
      message: "缺少 account，请提供要修改的用户账号",
    });
  }

  if (Object.keys(fields).length === 0) {
    return res.send({
      status: 400,
      message: "未提供任何需要更新的字段",
    });
  }

  // 构建动态 SQL 语句
  const updates = Object.keys(fields)
    .map((key) => `${key} = ?`)
    .join(", ");
  const values = [...Object.values(fields), account];
  const sql = `UPDATE users SET ${updates} WHERE account = ?`;

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
        message: "用户不存在或未修改任何字段",
      });
    }

    return res.send({
      status: 200,
      message: "用户信息更新成功",
    });
  });
};

// 修改用户密码 先输入旧密码 oldPassword 新密码 newPassword
exports.changePassword = (req, res) => {
  const sql = "select password from users where account = ?";
  db.query(sql, req.body.account, (err, result) => {
    if (err) return res.cc(err);
    const compareResult = bcrypt.compareSync(
      req.body.oldPassword,
      result[0].password
    );
    if (!compareResult) {
      return res.send({
        status: 500,
        message: "原密码错误",
      });
    }

    const newPassword = req.body.newPassword;
    req.body.newPassword = bcrypt.hashSync(req.body.newPassword, 10);
    const sql1 =
      "UPDATE users SET password = ?, origin_password = ? WHERE account = ?";
    db.query(
      sql1,
      [req.body.newPassword, newPassword, req.body.account],
      (err, result) => {
        if (err) return res.cc(err);
        res.send({
          status: 200,
          message: "修改成功",
        });
      }
    );
  });
};

exports.forgetPassword = (req, res) => {
  const password = req.body.password;
  req.body.password = bcrypt.hashSync(req.body.password, 10);
  const sql1 =
    "UPDATE users SET password = ?, origin_password = ? WHERE account = ?";
  db.query(
    sql1,
    [req.body.password, password, req.body.account],
    (err, result) => {
      if (err) return res.cc(err);
      res.send({
        status: 200,
        message: "修改成功",
      });
    }
  );
};

// 获取系统信息
exports.getSystemInfo = (req, res) => {
  const sql = "SELECT * FROM systeminfo";

  db.query(sql, (err, result) => {
    if (err) {
      return res.send({
        status: 500,
        message: "数据库查询失败",
        error: err,
      });
    }
    return res.send({
      data: { ...result[0] },
      status: 200,
      message: "获取数据成功",
    });
  });
};

exports.updateSystemInfo = (req, res) => {
  const { ...fields } = req.body;
  let id = 1;
  const updates = Object.keys(fields)
    .map((key) => `${key} = ?`)
    .join(", ");
  const values = [...Object.values(fields), id];
  const sql = `UPDATE systeminfo SET ${updates} WHERE id = ?`;

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
        message: "用户不存在或未修改任何字段",
      });
    }

    return res.send({
      status: 200,
      message: "系统信息更新成功",
    });
  });
};

// 获取用户列表
exports.getUserList = (req, res) => {
  let { page, limit } = req.body;
  const fields = [
    "account",
    "identity",
    "create_time",
    "exists_status",
    "nickname",
    "wechat_id",
  ];
  const queryConditions = [];
  const queryValues = [];

  Object.keys(req.body).forEach((field) => {
    if (req.body[field] && fields.includes(field)) {
      queryConditions.push(`${field} = ?`);
      queryValues.push(req.body[field]);
    }
  });

  let sql;
  if (queryConditions?.length) {
    sql = `SELECT * FROM users WHERE ${queryConditions.join(" AND ")}`;
  } else {
    sql = "SELECT * FROM users";
  }

  db.query(sql, queryValues, (err, result) => {
    if (err) {
      return res.send({
        status: 500,
        message: "数据库查询失败",
        error: err,
      });
    } else {
      let total = result.length;
      const offset = (page - 1) * limit;
      sql += ` LIMIT ? OFFSET ?`;
      queryValues.push(limit, offset);

      db.query(sql, queryValues, (err, result) => {
        if (err) {
          return res.send({
            status: 500,
            message: "数据库查询失败",
            error: err,
          });
        } else {
          let resArr = [];
          result.forEach((item) => {
            resArr.push({
              account: item.account,
              identity: item.identity,
              create_time: item.create_time,
              exists_status: item.exists_status,
              nickname: item.nickname,
              wechat_id: item.wechat_id,
            });
          });
          return res.send({
            status: 200,
            message: "获取数据成功",
            data: resArr,
            total,
            pagination: {
              page,
              limit,
              total,
            },
          });
        }
      });
    }
  });
};

exports.deleteUserList = (req, res) => {
  const { account } = req.body;
  const sql = "DELETE FROM users WHERE account = ?";

  db.query(sql, [account], (err, result) => {
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
};

exports.editUserList = (req, res) => {
  const { account, identity, nickname, wechat_id, exists_status } = req.body;
  const sql =
    "UPDATE users SET identity = ?, nickname = ?, wechat_id = ?, exists_status = ? WHERE account = ?";

  db.query(
    sql,
    [identity, nickname, wechat_id, exists_status, account],
    (err, result) => {
      if (err) {
        return res.send({
          status: 500,
          message: "数据库更新失败",
          error: err,
        });
      }

      if (result.affectedRows === 0) {
        return res.send({
          status: 404,
          message: "未找到匹配的记录",
        });
      }

      return res.send({
        status: 200,
        message: "更新数据成功",
      });
    }
  );
};
