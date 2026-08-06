const express = require("express");
const router = express.Router();
const uploadHandler = require("../../../services/upload");

// 通用上传接口：通过 query 参数 folder=cards|covers 决定存储目录
router.post("/uploadImage", uploadHandler.uploadImage);

// 获取图片流接口：filePath 参数格式如 /uploads/covers/xxx.png
router.get("/getImageStream", uploadHandler.getImageStream);

// 批量压缩服务器存量图片
router.post("/compressExistingImages", uploadHandler.compressExistingImages);

// 一键撤销还原备份原图
router.post("/rollbackCompressedImages", uploadHandler.rollbackCompressedImages);

module.exports = router;
