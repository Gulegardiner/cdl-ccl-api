const express = require("express");
const router = express.Router();
const collectTagHandler = require("../../../services/collectTag");

// 收卡状态标签相关接口
router.post("/createCollectTag", collectTagHandler.createCollectTag);
router.post("/getCollectTagList", collectTagHandler.getCollectTagList);
router.post("/updateCollectTag", collectTagHandler.updateCollectTag);
router.post("/deleteCollectTag", collectTagHandler.deleteCollectTag);
router.post("/getCollectCardTags", collectTagHandler.getCollectCardTags);
router.post("/updateCollectCardTags", collectTagHandler.updateCollectCardTags);

module.exports = router;
