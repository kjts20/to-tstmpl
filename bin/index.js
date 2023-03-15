#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { resolve } = require('path');
const { deleteFileOrFolder, scanFileOrFolder } = require('../utils');

// 默认模板名字
const defaultTemplateDirName = '.ts-template';

// 忽略列表
const ignoreList = (function (ignoreFile) {
    try {
        return fs
            .readFileSync(ignoreFile)
            .toString()
            .split('\n')
            .filter(it => !it.startsWith('#'));
    } catch (e) {
        console.log('没有设置忽略文件');
        return [];
    }
})('.gitignore').filter(it => it);

// 忽略规则
const getIgnorePatternList = function (ignoreRules) {
    ignoreRules.push('.git');
    ignoreRules.push('.DS_Store');
    ignoreRules.push('.idea');
    ignoreRules.push('node_modules');
    return ignoreRules.map(it => {
        const reStr = it.replace(/\./, '\\.').replace(/\*/g, '.*?');
        return new RegExp('^' + reStr + '$');
    });
};

// 是否忽略
const isIgnore = function (fileOrFolder) {
    const ignorePatternList = getIgnorePatternList(ignoreList);
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
    error: console.error
};

// 首字母大写
const firstUpcase = txt => {
    const it = (txt || '') + '';
    return (it[0] || '').toUpperCase() + it.slice(1);
};
const firstLowercase = txt => {
    const it = (txt || '') + '';
    return (it[0] || '').toLowerCase() + it.slice(1);
};

// 文件名字转命名
const fileName2VarName = function (fileName) {
    return (fileName + '')
        .split(/[\.\-\/\\\@]/)
        .map((it, i) => (i === 0 ? it : firstUpcase(it)))
        .join('');
};

// 文件名字转命名
const toGlobalExportVarName = function (fileName) {
    const paths = fileName.split(/[\/\\]/);
    return paths
        .map((it, i) => {
            let name = fileName2VarName(it);
            return i === 0 ? name : firstUpcase(name);
        })
        .join('');
};

// 只是复制的文件
const copyFileExt = ['png', 'jpeg', 'jpg'];

// 读取所有文件，并整理为ts模板
const project2TsTemplate = function (dirName, tsTemplateName) {
    // 生成相对路径
    const toAbsPath = fullPath => {
        const absPath = fullPath
            .replace(dirName, '')
            .replace(/^(\\|\/)(.+)$/, '$2')
            .replace('\\', '/');
        const dirname = path.dirname(absPath);
        return {
            fullName: absPath,
            basename: path.basename(absPath),
            dirname,
            dirnameArr: dirname.replace(/\\/g, '/').split('/')
        };
    };
    // 所有模版写入json文件
    const tmpls = [];
    // 记录文件夹下面文件{folderAbsName: ['fileAbsDirname']}
    const folderFileDict = {};
    scanFileOrFolder(dirName, {
        fileHandler: function (fileName) {
            const { basename, dirname, dirnameArr, fullName } = toAbsPath(fileName);
            if (!isIgnore(fullName)) {
                const isHideFile = /^\..*?$/.test(basename);
                const ext = isHideFile ? '' : basename.slice(basename.lastIndexOf('.') + 1);
                if (copyFileExt.includes(ext)) {
                    // 复制文件
                    fs.copyFileSync(fileName, resolve(tsTemplateName, fullName));
                } else {
                    // 文本文件
                    const fileVarName = fileName2VarName(basename);
                    // 记录目录中文件情况
                    if (!Array.isArray(folderFileDict[dirname])) {
                        folderFileDict[dirname] = [];
                    }
                    folderFileDict[dirname].push(fileVarName);
                    // 写入文件
                    const pathAndFile = [...dirnameArr, basename.slice(0, basename.length - ext.length - (isHideFile ? 0 : 1))];
                    const sourceFileContentStr = fs.readFileSync(fileName, 'utf8').toString();
                    const fileContentStr = sourceFileContentStr.replace(/`/g, '\\`').replace(/(\$\{.*?\})/g, '\\$1');
                    // 文件内容名字
                    const fileContentName = fileVarName + 'Content';
                    // 路径
                    const pathAndName = pathAndFile.filter(it => it !== '.');
                    const fileNameStr = pathAndName.pop() || '';
                    const fileContent = [
                        'const ' + fileContentName + ' = `\n' + fileContentStr + '\n`;',
                        `export const ${toGlobalExportVarName(fullName)} = {content: ${fileContentName}, paths: [${pathAndName.map(
                            it => "'" + it + "'"
                        )}], name: '${fileNameStr}', extension:'${ext}'};`
                    ];
                    fs.writeFileSync(resolve(tsTemplateName, dirname, fileVarName + '.ts'), fileContent.join('\n'));
                    // 记录模版信息
                    tmpls.push({
                        name: fileNameStr,
                        paths: pathAndName,
                        content: sourceFileContentStr,
                        extension: ext
                    });
                }
            }
        },
        beforeFolderReadHandler: function (folder) {
            const { fullName } = toAbsPath(folder);
            if (!isIgnore(fullName)) {
                fs.mkdirSync(resolve(tsTemplateName, fullName));
                return true;
            } else {
                return false;
            }
        },
        afterFolderReadHandler: function (folder) {
            const { fullName } = toAbsPath(folder);
            const toExport = exportFileList => (exportFileList || []).map(it => `export * from "./${it}";`);
            // 写index.ts
            let fileContent = [];
            if (fullName) {
                // 非根目录写入index.ts
                fileContent = toExport(folderFileDict[fullName]);
            } else {
                // 根目录写入index.ts
                for (const key in folderFileDict) {
                    if (key === '.') {
                        fileContent = [...fileContent, ...toExport(folderFileDict[key])];
                    } else {
                        fileContent.push(`export * from "./${key}";`);
                    }
                }
            }
            if (fileContent.length > 0) {
                fs.writeFileSync(resolve(tsTemplateName, fullName, 'index.ts'), fileContent.join('\n'));
            }
        }
    });
    // 把所有模版写入json文件
    fs.writeFileSync(resolve(tsTemplateName, 'templates-lock.json'), JSON.stringify(tmpls));
};

// 初始化函数
const init = function (workDir, templateDirName) {
    if (!templateDirName) {
        templateDirName = defaultTemplateDirName;
    }
    console.log(`工作目录：${workDir}，生成模板目录名： ${templateDirName}`);
    // 清除旧目录
    deleteFileOrFolder(resolve(workDir, templateDirName));
    // 设置忽略文件
    ignoreList.push(templateDirName);
    // 开始工作
    project2TsTemplate(workDir, resolve(workDir, templateDirName));
    console.log(`生成模板完毕，请验证！！！`);
};

// 初始化
init(process.cwd(), process.argv[2]);
