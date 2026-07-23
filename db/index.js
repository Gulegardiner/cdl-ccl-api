// 导入mysql数据库
const mysql = require('mysql')

// 创建与数据库的连接
const db = mysql.createPool({
	host:'47.96.86.242',//localhost  47.96.86.242
	user:'cdl_ccl_db',
	password:'Yubin0619',
	database:'cdl_ccl_db'
})

// 对外暴露数据库
module.exports = db
