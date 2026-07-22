/*
 CCL API 数据库初始化脚本
 数据库：cdl_ccl_db
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- 用户表
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`  (
  `id` int(11) UNSIGNED ZEROFILL NOT NULL AUTO_INCREMENT,
  `account` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `identity` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `create_time` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `exists_status` int(11) NULL DEFAULT 0,
  `nickname` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `image_url` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `update_time` datetime NULL DEFAULT NULL,
  `wechat_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `origin_password` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;


-- ----------------------------
-- 图片表（新版）
-- ----------------------------
DROP TABLE IF EXISTS `images`;
CREATE TABLE `images`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `image_url` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `account` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `onlyId` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- 系统信息表
-- ----------------------------
DROP TABLE IF EXISTS `systeminfo`;
CREATE TABLE `systeminfo`  (
  `id` int(11) NOT NULL,
  `themeColor` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic;

-- 初始化系统信息默认数据
INSERT INTO `systeminfo` VALUES (1, 'rgba(18, 170, 220, 1)');

-- ----------------------------
-- 卡池信息表
-- ----------------------------
DROP TABLE IF EXISTS `books`;
CREATE TABLE `books` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `book_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '卡池唯一标识ID',
  `name` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '卡池名称',
  `theme` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '主题',
  `description` text CHARACTER SET utf8 COLLATE utf8_general_ci NULL COMMENT '卡池描述',
  `cover_color` varchar(500) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '封面渐变色',
  `cover_image_url` varchar(500) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '封面图片URL',
  `created_at` bigint(20) NULL DEFAULT NULL COMMENT '创建时间戳',
  `updated_at` bigint(20) NULL DEFAULT NULL COMMENT '更新时间戳',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_book_id` (`book_id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic COMMENT = '卡池信息表';

-- ----------------------------
-- 卡池分组表
-- ----------------------------
DROP TABLE IF EXISTS `series`;
CREATE TABLE `series` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `series_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '分组唯一标识ID',
  `book_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '所属卡池ID',
  `name` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '分组名称',
  `description` varchar(500) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '分组描述',
  `created_at` bigint(20) NULL DEFAULT NULL COMMENT '创建时间戳',
  `updated_at` bigint(20) NULL DEFAULT NULL COMMENT '更新时间戳',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_series_id` (`series_id`) USING BTREE,
  KEY `idx_book_id` (`book_id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic COMMENT = '卡池分组表';

-- ----------------------------
-- 卡片表
-- ----------------------------
DROP TABLE IF EXISTS `cards`;
CREATE TABLE `cards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `card_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '卡片唯一标识ID',
  `book_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '所属卡池ID',
  `series_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '所属分组ID（可选）',
  `name` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '卡片名称',
  `image_url` varchar(500) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '卡片图片URL',
  `back_image_url` varchar(500) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '卡片背面图片URL',
  `rarity` varchar(50) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '稀有度（R/SR/SSR等）',
  `series_name` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '所属分组名称',
  `display_style` varchar(50) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT 'card' COMMENT '展示样式（card等）',
  `orientation` varchar(50) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT 'portrait' COMMENT '方向（portrait/landscape）',
  `note` text CHARACTER SET utf8 COLLATE utf8_general_ci NULL COMMENT '备注',
  `owned_count` int(11) NULL DEFAULT 0 COMMENT '拥有数量',
  `onlyId` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '前端表单唯一标识',
  `account` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL COMMENT '所属账号',
  `created_at` bigint(20) NULL DEFAULT NULL COMMENT '创建时间戳',
  `updated_at` bigint(20) NULL DEFAULT NULL COMMENT '更新时间戳',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_card_id` (`card_id`) USING BTREE,
  KEY `idx_book_id` (`book_id`) USING BTREE,
  KEY `idx_series_id` (`series_id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic COMMENT = '卡片表';

-- ----------------------------
-- 用户卡片拥有关系表
-- ----------------------------
DROP TABLE IF EXISTS `user_cards`;
CREATE TABLE `user_cards` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '用户账号',
  `card_id` varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL COMMENT '卡片唯一标识ID',
  `owned_count` int(11) NULL DEFAULT 0 COMMENT '拥有数量',
  `created_at` bigint(20) NULL DEFAULT NULL COMMENT '创建时间戳',
  `updated_at` bigint(20) NULL DEFAULT NULL COMMENT '更新时间戳',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `uk_account_card` (`account`, `card_id`) USING BTREE,
  KEY `idx_account` (`account`) USING BTREE,
  KEY `idx_card_id` (`card_id`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Dynamic COMMENT = '用户卡片拥有关系表';

SET FOREIGN_KEY_CHECKS = 1;

