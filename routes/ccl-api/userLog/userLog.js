const express = require("express");
const router = express.Router();
const userLogHandler = require("../../../services/userLog");

// 记录操作日志
router.post("/createLog", userLogHandler.createLog);

// 获取操作日志列表
router.post("/getLogList", userLogHandler.getLogList);

// 按日期和操作类型删除日志
router.post("/deleteLog", userLogHandler.deleteLog);

module.exports = router;
