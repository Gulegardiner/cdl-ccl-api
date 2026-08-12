const express = require("express");
const router = express.Router();
const messageHandler = require("../../../services/message");

// 获取留言列表
router.post("/getMessageList", messageHandler.getMessageList);

// 获取留言详情及回复
router.post("/getMessageDetail", messageHandler.getMessageDetail);

// 发布新留言
router.post("/createMessage", messageHandler.createMessage);

// 发表回复
router.post("/createReply", messageHandler.createReply);

// 置顶/取消置顶留言（管理员）
router.post("/toggleTop", messageHandler.toggleTop);

// 删除留言
router.post("/deleteMessage", messageHandler.deleteMessage);

// 删除回复
router.post("/deleteReply", messageHandler.deleteReply);

module.exports = router;
