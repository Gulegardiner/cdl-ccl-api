const express = require("express");
const router = express.Router();
const cardHandler = require("../../../services/card");

// 获取卡片列表（支持按 book_id 或 series_id 筛选和分页）
router.post("/getCardList", cardHandler.getCardList);

// 获取单个卡片详情
router.post("/getCardDetail", cardHandler.getCardDetail);

// 新增卡片
router.post("/createCard", cardHandler.createCard);

// 更新卡片
router.post("/updateCard", cardHandler.updateCard);

// 删除卡片
router.post("/deleteCard", cardHandler.deleteCard);

module.exports = router;
