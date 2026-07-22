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

// 获取当前用户的所有拥有卡片关系列表
router.post("/getUserCardList", cardHandler.getUserCardList);

// 直接更新或新增卡片拥有数
router.post("/updateUserCard", cardHandler.updateUserCard);

// 点亮卡片
router.post("/litCard", cardHandler.litCard);

// 取消点亮卡片
router.post("/unlitCard", cardHandler.unlitCard);

module.exports = router;

