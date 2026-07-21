const joi = require("joi");

const account = joi.required();
const nickname = joi
  .string()
  .pattern(/^[\u4E00-\u9FA5]{2,10}(·[\u4E00-\u9FA5]{2,10}){0,2}$/)
  .required();

const oldPassword = joi
  .string()
  .pattern(/^(?![0-9]+$)[a-z0-9]{1,50}$/)
  .min(6)
  .max(12)
  .required();
const newPassword = joi
  .string()
  .pattern(/^(?![0-9]+$)[a-z0-9]{1,50}$/)
  .min(6)
  .max(12)
  .required();

// 这个校验会导致只会接收前端传来的这两个字段
exports.updateUserInfo_limit = {
  body: {
    account,
    nickname,
  },
};

exports.password_limit = {
  body: {
    account,
    oldPassword,
    newPassword,
  },
};
