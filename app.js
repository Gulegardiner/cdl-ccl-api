var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

// 创建express实例
var app = express();

// 导入cors处理跨域
const cors = require("cors");
app.use(cors());

// 导入body-parser：处理表单的中间件
var bodyParser = require("body-parser");
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);
app.use(bodyParser.json());

// Multer 用于处理 multipart/form-data 类型的表单数据（文件上传）
const multer = require("multer");

// 设置文件存储路径和文件名
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     if (file.mimetype.startsWith("image/")) {
//       cb(null, "./public/uploads/Image");
//     } else {
//       cb(null, "./public/uploads/Others");
//     }
//   },
//   filename: (req, file, cb) => {
//     const originalName = file.originalname;
//     const encodedName = Buffer.from(originalName, "latin1").toString("utf8");
//     cb(null, encodedName);
//   },
// });
// const upload = multer({ storage: storage });
// app.use(upload.any());
// 静态托管
app.use(express.static("./public"));

// 在所有的路由前面，挂载一个错误处理的中间件
app.use((req, res, next) => {
  res.cc = (err, status = 500) => {
    res.send({
      status,
      message: err instanceof Error ? err.message : err,
    });
  };
  next();
});

const jwtconfig = require("./jwt_config/index.js");
const { expressjwt: jwt } = require("express-jwt");
// 排除不需要携带token的接口
app.use(
  jwt({
    secret: jwtconfig.jwtSecretKey,
    algorithms: ["HS256"],
  }).unless({
    path: [
      // 登录注册接口无需 token
      /^\/ccl-api\/user\/login/,
      /^\/ccl-api\/user\/register/,
      /^\/ccl-api\/user\/getSystemInfo/,
      /^\/ccl-api\/user\/getUserInfo/,
      /^\/ccl-api\/user\/getKaptcha/,
      /^\/ccl-api\/user\/checkKaptcha/,
      /^\/ccl-api\/book\/getBookList/,
      /^\/ccl-api\/series\/getSeriesList/,
      /^\/ccl-api\/upload\/uploadImage/,
      /^\/ccl-api\/upload\/getImageStream/,
      /^\/ccl-api\/card\/getCardList/,
      /^\/ccl-api\/card\/getCardDetail/,


    ],
  })
);

// 挂载路由
const loginRouter = require("./routes/ccl-api/user/login");
app.use("/ccl-api/user", loginRouter);

const userRouter = require("./routes/ccl-api/user/userinfo");
app.use("/ccl-api/user", userRouter);

// 卡池路由
const bookRouter = require("./routes/ccl-api/book/book");
app.use("/ccl-api/book", bookRouter);

// 卡池分组路由
const seriesRouter = require("./routes/ccl-api/series/series");
app.use("/ccl-api/series", seriesRouter);

// 卡片路由
const cardRouter = require("./routes/ccl-api/card/card");
app.use("/ccl-api/card", cardRouter);

// 通用上传路由
const uploadRouter = require("./routes/ccl-api/upload/upload");
app.use("/ccl-api/upload", uploadRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// 对不符合joi验证规则的数据进行报错拦截
const Joi = require("joi");

// error handler
app.use(function (err, req, res, next) {
  // JWT 认证失败
  if (err.name === "UnauthorizedError") {
    return res.send({
      status: 401,
      message: "登录过期，请重新登录",
    });
  }

  // Joi 验证失败
  if (err instanceof Joi.ValidationError) {
    return res.send({
      status: 400,
      message: "输入的数据不符合验证规则",
    });
  }

  res.status(err.status || 500);
  res.send({
    status: err.status || 500,
    message: err.message,
    error: req.app.get("env") === "development" ? err : {},
  });
});

module.exports = app;
