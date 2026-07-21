const joi = require("joi");

// 账号的验证（允许字母、数字以及下划线和特殊字符）
const account = joi
  .string()
  .pattern(/^[a-zA-Z0-9_!@#$%^&*()-+=]{6,12}$/)
  .min(6)
  .max(12)
  .required();
// 密码的验证
const password = joi
  .string()
  .pattern(/^[a-zA-Z0-9_!@#$%^&*()-+=]{1,50}$/)
  .min(6)
  .max(12)
  .required();

exports.login_limit = {
  // 表示对req.body里面的数据进行验证
  body: {
    account,
    password,
  },
};
