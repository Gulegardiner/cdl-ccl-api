const express = require("express");
const router = express.Router();
const updateLogHandler = require("../../../services/updateLog");

// 获取更新日志列表
router.post("/getLogList", updateLogHandler.getLogList);

// 发布新更新日志（仅管理员）
router.post("/createLog", updateLogHandler.createLog);

// 删除更新日志（仅管理员）
router.post("/deleteLog", updateLogHandler.deleteLog);

module.exports = router;
