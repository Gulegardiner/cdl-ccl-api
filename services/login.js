// 导入数据库操作模块，来增删查改
const db = require("../db/index");
// 导入bcrypt加密中间件
const bcrypt = require("bcryptjs");
// 导入jwt,用于生成token
const jwt = require("jsonwebtoken");
// 导入jwt配置文件，用于加密跟解密
const jwtconfig = require("../jwt_config/index.js");
const kaptchaStore = require("./kaptchaStore");

// 注册
exports.register = (req, res) => {
  const reginfo = req.body;
  const origin_password = reginfo.password;

  // 第一步,判断前端传过来的数据有没有空
  if (!reginfo.account || !reginfo.password) {
    return res.send({
      status: 500,
      message: "账号或者密码不能为空",
    });
  }

  // 第二步,判断前端传过来账号有没有已经存在在数据表中：
  const sql = "select * from users where account = ?";
  db.query(sql, reginfo.account, (err, results) => {
    if (err) return res.cc(err);
    if (results.length > 0) {
      return res.send({
        status: 500,
        message: "账号已存在",
      });
    }

    // 第三步,对密码进行加密
    reginfo.password = bcrypt.hashSync(reginfo.password, 10);
    // 第四步,把账号跟密码插入到users表里面
    const sql1 = "insert into users set ?";
    const identity = "user";
    const create_time = new Date();
    db.query(
      sql1,
      {
        account: reginfo.account,
        password: reginfo.password,
        origin_password,
        identity,
        create_time,
        exists_status: "0",
      },
      (err, results) => {
        if (results.affectedRows !== 1) {
          return res.send({
            status: 500,
            message: "注册账号失败",
          });
        }
        res.send({
          status: 200,
          message: "注册账号成功",
        });
      }
    );
  });
};

// 登录
exports.login = (req, res) => {
  const loginfo = req.body;
  const sql = "select * from users where account = ?";
  db.query(sql, loginfo.account, (err, results) => {
    if (err) return res.cc(err);
    if (results.length !== 1) return res.cc("登录失败");

    const compareResult = bcrypt.compareSync(
      loginfo.password,
      results[0].password
    );
    if (!compareResult) {
      return res.cc("密码错误");
    }
    if (results[0].exists_status === "1") {
      return res.cc("账号被冻结");
    }
    // 生成返回给前端的token
    const user = {
      ...results[0],
      password: "",
      imageUrl: "",
      create_time: "",
      update_time: "",
    };
    const tokenStr = jwt.sign(user, jwtconfig.jwtSecretKey, {
      expiresIn: "48h",
    });
    res.send({
      results: results[0],
      status: 200,
      message: "登录成功",
      token: "Bearer " + tokenStr,
    });
  });
};

// 获取验证码
exports.getKaptcha = (req, res) => {
  const nonceStr = "5bc4c00244474db5897915d2937857ae";
  const blockX = 207;
  kaptchaStore.set(nonceStr, {
    blockX,
    createTime: Date.now(),
  });
  res.send({
    status: 200,
    message: "获取验证码成功",
    data: {
      nonceStr,
      value: null,
      blockX,
      blockWidth: 65,
      blockHeight: 55,
      blockRadius: 9,
      blockY: 113,
      place: 0,
    },
  });
};

// 校验验证码
exports.checkKaptcha = (req, res) => {
  const { nonceStr, moveXLength } = req.body;
  const record = kaptchaStore.get(nonceStr);
  console.log(record);
  if (!record) {
    return res.send({
      status: 400,
      message: "验证码已失效",
    });
  }
  const { blockX, createTime } = record;
  const now = Date.now();
  if (now - createTime > 2 * 60 * 1000) {
    kaptchaStore.delete(nonceStr);
    return res.send({
      status: 400,
      message: "验证码过期",
    });
  }

  const tolerance = 6;
  const diff = Math.abs(moveXLength - blockX);

  if (diff <= tolerance) {
    kaptchaStore.delete(nonceStr);
    return res.send({
      status: 200,
      message: "验证成功",
    });
  }

  return res.send({
    status: 400,
    message: "验证失败",
  });
};
