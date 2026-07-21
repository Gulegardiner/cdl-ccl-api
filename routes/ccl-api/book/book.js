const express = require("express");
const router = express.Router();
const bookHandler = require("../../../services/book");

// 获取卡池列表（支持分页和筛选）
router.post("/getBookList", bookHandler.getBookList);

// 获取单个卡池详情
router.post("/getBookDetail", bookHandler.getBookDetail);

// 新增卡池
router.post("/createBook", bookHandler.createBook);

// 更新卡池
router.post("/updateBook", bookHandler.updateBook);

// 删除卡池
router.post("/deleteBook", bookHandler.deleteBook);

module.exports = router;
