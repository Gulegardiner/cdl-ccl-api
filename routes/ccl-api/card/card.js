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

// 喜欢卡片
router.post("/likeCard", cardHandler.likeCard);

// 取消喜欢卡片
router.post("/unlikeCard", cardHandler.unlikeCard);

// 标记为不想要
router.post("/unwantCard", cardHandler.unwantCard);

// 取消不想要标记
router.post("/cancelUnwantCard", cardHandler.cancelUnwantCard);

// 保存文字识别历史导入记录
router.post("/saveImportHistory", cardHandler.saveImportHistory);

// 获取已有的文字识别历史导入记录
router.post("/getImportHistory", cardHandler.getImportHistory);

// 清空当前用户的所有点亮记录、收换卡记录
router.post("/clearUserCards", cardHandler.clearUserCards);

// 清空当前用户指定卡池的点亮记录、收换卡记录及导入历史
router.post("/clearUserCardsByBook", cardHandler.clearUserCardsByBook);

// 标签相关接口
router.post("/createTag", cardHandler.createTag);
router.post("/getTagList", cardHandler.getTagList);
router.post("/updateTag", cardHandler.updateTag);
router.post("/deleteTag", cardHandler.deleteTag);
router.post("/getExchangeCardTags", cardHandler.getExchangeCardTags);
router.post("/updateCardTags", cardHandler.updateCardTags);
router.post("/updateAlreadyChangedCards", cardHandler.updateAlreadyChangedCards);

module.exports = router;


