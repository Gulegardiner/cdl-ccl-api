const express = require("express");
const router = express.Router();
const seriesHandler = require("../../../services/series");

// 获取分组列表（支持按 book_id 筛选和分页）
router.post("/getSeriesList", seriesHandler.getSeriesList);

// 获取单个分组详情
router.post("/getSeriesDetail", seriesHandler.getSeriesDetail);

// 新增分组
router.post("/createSeries", seriesHandler.createSeries);

// 更新分组
router.post("/updateSeries", seriesHandler.updateSeries);

// 删除分组
router.post("/deleteSeries", seriesHandler.deleteSeries);

module.exports = router;
