const express = require("express");
const router = express.Router();
const uploadHandler = require("../../../services/upload");

// 通用上传接口：通过 query 参数 folder=cards|covers 决定存储目录
router.post("/uploadImage", uploadHandler.uploadImage);

module.exports = router;
