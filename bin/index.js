#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { resolve } = require("path");
const { deleteFileOrFolder, scanFileOrFolder } = require("../utils");

// 默认模板名字
const defaultTmplDirName = ".ts-tmpl";
// 忽略规则
const ignorePatternList = (function () {
    const patternList = (function () {
        try {
            return fs
                .readFileSync(".gitignore")
                .toString()
                .split("\n")
                .filter((it) => !it.startsWith("#"));
        } catch (e) {
            console.log("没有设置忽略文件");
            return [];
        }
    })().filter((it) => it);
    patternList.push(".git");
    patternList.push(defaultTmplDirName);
    return patternList.map((it) => {
        const reStr = it.replace(/\./, "\\.").replace(/\*/g, ".*?");
        return new RegExp(reStr);
    });
})();

// 是否忽略
const isIgnore = function (fileOrFolder) {
    for (const ignorePattern of ignorePatternList) {
        if (ignorePattern.test(path.basename(fileOrFolder))) {
            return true;
        }
    }
    return false;
};

// 日志方面
const logger = {
    log: console.log,
    warn: console.warn,
    error: console.error,
};

// 首字母大写
const firstUpcase = (txt) => {
    const it = (txt || "") + "";
    return (it[0] || "").toUpperCase() + it.slice(1);
};
const firstLowercase = (txt) => {
    const it = (txt || "") + "";
    return (it[0] || "").toLowerCase() + it.slice(1);
};

/**
 * 去掉首部的点
 */
const trimFirstPoint = function (str) {
    return (str || "").replace(/^\.(.+)$/, "$1");
};

// 文件名字转命名
const fileName2VarName = function (fileName) {
    return (fileName + "")
        .split(".")
        .map((it, i) => (i === 0 ? it : firstUpcase(it)))
        .join("");
};
// 文件名字转命名
const toGlobalExportVarName = function (fileName) {
    const paths = fileName.split("/");
    const lastIndex = paths.length - 1;
    return paths
        .map((it, i) => {
            let name = it;
            if (i === lastIndex) {
                name = fileName2VarName(it);
            }
            return i === 0 ? name : firstUpcase(name);
        })
        .join("");
};
//  获取文件名字
const getFilename = function (basename) {
    return basename.slice(0, basename.lastIndexOf("."));
};

// 读取所有文件，并整理为ts模板
const project2TsTmpl = function (dirName, tsTmplName) {
    // 生成相对路径
    const toAbsPath = (fullPath) => {
        const absPath = fullPath
            .replace(dirName, "")
            .replace(/^(\\|\/)(.+)$/, "$2")
            .replace("\\", "/");
        const dirname = path.dirname(absPath);
        return {
            fullname: absPath,
            basename: path.basename(absPath),
            dirname,
            dirnameArr: dirname.replace(/\\/g, "/").split("/"),
        };
    };
    // 记录文件夹下面文件{folderAbsName: ['fileAbsDirname']}
    const folderFileDict = {};
    scanFileOrFolder(dirName, {
        fileHanlder: function (fileName) {
            const { basename, dirname, dirnameArr, fullname } = toAbsPath(fileName);
            if (!isIgnore(fullname)) {
                const fileVarName = fileName2VarName(basename);
                // 记录目录中文件情况
                if (!Array.isArray(folderFileDict[dirname])) {
                    folderFileDict[dirname] = [];
                }
                folderFileDict[dirname].push(fileVarName);
                // 写入文件
                const ext = path.extname(basename);
                const pathAndFile = [...dirnameArr, getFilename(basename)];
                const fileContent = ["const " + fileVarName + "File = `\n" + fs.readFileSync(fileName) + "\n`;", `export const ${toGlobalExportVarName(fullname)} = {file: ${fileVarName}File, name: [${pathAndFile.map((it) => "'" + it + "'")}], ext:'${trimFirstPoint(ext)}'};`].join("\n");
                fs.writeFileSync(resolve(tsTmplName, dirname, fileVarName + ".ts"), fileContent);
            }
        },
        beforeFolderReadHandler: function (folder) {
            const { fullname } = toAbsPath(folder);
            if (!isIgnore(fullname)) {
                fs.mkdirSync(resolve(tsTmplName, fullname));
                return true;
            } else {
                return false;
            }
        },
        afterFolderReadHandler: function (folder) {
            const { fullname } = toAbsPath(folder);
            const toExport = (exportFileList) => (exportFileList ||[]).map((it) => `export * from "./${it}";`);
            // 写index.ts
            let fileContent = [];
            if (fullname) {
                // 非根目录写入index.ts
                fileContent = toExport(folderFileDict[fullname]);
            } else {
                // 根目录写入index.ts
                for (const key in folderFileDict) {
                    if (key === ".") {
                        fileContent = [...fileContent, ...toExport(folderFileDict[key])];
                    } else {
                        fileContent.push(`export * from "./${key}";`);
                    }
                }
            }
            if(fileContent.length > 0){
                fs.writeFileSync(resolve(tsTmplName, fullname, "index.ts"), fileContent.join("\n"));
            }
        },
    });
};

// 初始化函数
const init = function (workDir, tmplDirName) {
    if (!tmplDirName) {
        tmplDirName = defaultTmplDirName;
    }
    console.log(`工作目录：${workDir}，生成模板目录名： ${tmplDirName}`);
    // 清除旧目录
    deleteFileOrFolder(resolve(workDir, tmplDirName));
    // 开始工作
    project2TsTmpl(workDir, resolve(workDir, tmplDirName));
    console.log(`生成模板完毕，请验证！！！`);
};

// 初始化
init(process.cwd(), process.argv[2]);
