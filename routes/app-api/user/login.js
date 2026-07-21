// 登录注册模块路由

const express = require("express");
const router = express.Router();

// 导入login的路由处理模块
const loginHandler = require("../../../services/login");

const Joi = require("joi");
// 导入expressJoi
const expressJoi = require("@escook/express-joi");
// 导入验证规则
const { login_limit } = require("../../../limit/login.js");

// post接口
// 在路由里加上验证规则
router.post("/register", expressJoi(login_limit), loginHandler.register);
router.post("/login", expressJoi(login_limit), loginHandler.login);
router.get("/getKaptcha", loginHandler.getKaptcha);
router.post("/checkKaptcha", loginHandler.checkKaptcha);

// 向外暴露路由
module.exports = router;
