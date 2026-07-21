const express = require("express");
const router = express.Router();
const expressJoi = require("@escook/express-joi");
const userinfoHandler = require("../../../services/userinfo");
// 导入验证规则
const {
  updateUserInfo_limit,
  password_limit,
} = require("../../../limit/user.js");

// 上传头像
router.post("/uploadAvatar", userinfoHandler.uploadAvatar);
// 绑定账号
router.post("/bindAccount", userinfoHandler.bindAccount);
// 获取用户信息
router.post("/getUserInfo", userinfoHandler.getUserInfo);
// 更新用户信息
router.post("/updateUserInfo", userinfoHandler.updateUserInfo);
// 修改密码
router.post(
  "/changePassword",
  expressJoi(password_limit),
  userinfoHandler.changePassword
);
// 忘记密码
router.post("/forgetPassword", userinfoHandler.forgetPassword);

// 获取系统信息
router.get("/getSystemInfo", userinfoHandler.getSystemInfo);
// 更新系统信息
router.post("/updateSystemInfo", userinfoHandler.updateSystemInfo);

// 获取用户列表
router.post("/getUserList", userinfoHandler.getUserList);
// 删除用户
router.delete("/deleteUser", userinfoHandler.deleteUserList);
// 编辑用户
router.post("/editUserList", userinfoHandler.editUserList);

module.exports = router;
