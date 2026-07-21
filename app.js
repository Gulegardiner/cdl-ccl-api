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
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, "./public/uploads/Image");
    } else {
      cb(null, "./public/uploads/Others");
    }
  },
  filename: (req, file, cb) => {
    const originalName = file.originalname;
    const encodedName = Buffer.from(originalName, "latin1").toString("utf8");
    cb(null, encodedName);
  },
});
const upload = multer({ storage: storage });
app.use(upload.any());
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

// 对不符合joi验证规则的数据进行报错拦截
const Joi = require("joi");
app.use((err, req, res, next) => {
  if (err instanceof Joi.ValidationError) {
    res.send({
      status: 500,
      message: "输入的数据不符合验证规则",
    });
  }
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
      /^\/app-api\/user\/login/,
      /^\/app-api\/user\/register/,
      /^\/app-api\/user\/getSystemInfo/,
      /^\/app-api\/user\/getUserInfo/,
      /^\/app-api\/user\/getKaptcha/,
      /^\/app-api\/user\/checkKaptcha/,
    ],
  })
);

// 挂载路由
const loginRouter = require("./routes/app-api/user/login");
app.use("/app-api/user", loginRouter);

const userRouter = require("./routes/app-api/user/userinfo");
app.use("/app-api/user", userRouter);

// 卡池路由
const bookRouter = require("./routes/app-api/book/book");
app.use("/app-api/book", bookRouter);

// 卡池分组路由
const seriesRouter = require("./routes/app-api/series/series");
app.use("/app-api/series", seriesRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  if (err.name === "UnauthorizedError") {
    return res.send({
      status: 401,
      message: "登录过期，请重新登录",
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
