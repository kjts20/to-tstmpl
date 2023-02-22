const fs = require('fs');
const { resolve } = require('path');

// 扫描文件
function scanFileOrFolder(fileOrFolder, options) {
    if (fs.existsSync(fileOrFolder)) {
        // 整理处理函数
        const { fileHandler, beforeFolderReadHandler, afterFolderReadHandler } = options || {};
        const sFileHandler = typeof fileHandler === 'function' ? fileHandler : () => {};
        const sBeforeFolderReadHandler = typeof beforeFolderReadHandler === 'function' ? beforeFolderReadHandler : () => true;
        const sAfterFolderReadHandler = typeof afterFolderReadHandler === 'function' ? afterFolderReadHandler : () => {};
        // 判断类型并进行回调
        const stat = fs.statSync(fileOrFolder);
        if (stat.isFile()) {
            sFileHandler(fileOrFolder);
        } else if (stat.isDirectory()) {
            if (sBeforeFolderReadHandler(fileOrFolder)) {
                fs.readdirSync(fileOrFolder).forEach(file => {
                    scanFileOrFolder(resolve(fileOrFolder, file), options);
                });
                sAfterFolderReadHandler(fileOrFolder);
            }
        }
    }
}

// 删除目录/文件
function deleteFileOrFolder(fileOrFolder) {
    scanFileOrFolder(fileOrFolder, {
        fileHandler: function (fileNam) {
            fs.unlinkSync(fileNam);
        },
        afterFolderReadHandler: function (folder) {
            fs.rmdirSync(folder);
        }
    });
}

module.exports = {
    scanFileOrFolder,
    deleteFileOrFolder
};
