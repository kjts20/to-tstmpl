#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { scanFileOrFolder } = require('../utils');

// 配置文件后缀
const configFileSuffix = '.tmpl.config.js';

// 模板文件名称
const tmplJsonName = 'sskj.tmpl';

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
    const ignoreList = ['.git', '.DS_Store', '.idea', 'node_modules', '.sskj', '*' + configFileSuffix, tmplJsonName];
    for (const it of ignoreList) {
        if (!ignoreRules.includes(it)) {
            ignoreRules.push(it);
        }
    }
    return ignoreRules.map(it => {
        const reStr = it
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*?')
            .replace(/^(.*?)[\/]*$/g, '$1');
        return {
            test(pathStr) {
                try {
                    const path = (pathStr || '') + '';
                    if (new RegExp(`^${reStr}$`).test(path)) {
                        return true;
                    } else if (new RegExp(`^${reStr}\/.+$`).test(path)) {
                        return true;
                    } else if (new RegExp(`\/${reStr}$`).test(path)) {
                        return true;
                    } else if (new RegExp(`\/${reStr}\/.+$`).test(path)) {
                        return true;
                    } else {
                        const pathParts = path.replace('\\', '/').split('/');
                        if (pathParts.includes(it)) {
                            return true;
                        } else {
                            return false;
                        }
                    }
                } catch (e) {
                    console.log('校验错误：', e);
                    return false;
                }
            }
        };
    });
};

// 是否忽略
const isIgnore = function (fileOrFolder) {
    const ignorePatternList = getIgnorePatternList(ignoreList);
    for (const ignorePattern of ignorePatternList) {
        if (ignorePattern.test(fileOrFolder)) {
            return true;
        }
    }
    return false;
};

/**
 * 生成模板配置名字
 * @param {名字} fileName
 * @returns
 */
const genTmplConfigName = function (fileName) {
    return `${fileName}${configFileSuffix}`;
};

/**
 * 读取模板配置文件
 * @param {模板名称} fileName
 * @returns
 */
const readTmplConfig = function (fileName, rootDir) {
    const confFileName = genTmplConfigName(fileName);
    if (fs.existsSync(confFileName)) {
        try {
            const configJson = fs.readFileSync(confFileName)?.toString();
            const func = new Function(`${configJson};return {title, forLoopFilename, forLoopItem, forLoopDs: forLoopDs.toString()}`);
            return func();
        } catch (err) {
            console.log(`读取“${confFileName.substring(rootDir.length + 1)}”配置失败`, err);
        }
    }
    return {};
};

// 首字母大写
const firstUpcase = txt => {
    const it = (txt || '') + '';
    return (it[0] || '').toUpperCase() + it.slice(1);
};

// 文件名字转命名
const fileName2VarName = function (fileName) {
    return (fileName + '')
        .split(/[\.\-\/\\\@]/)
        .map((it, i) => (i === 0 ? it : firstUpcase(it)))
        .join('');
};

// 只是复制的文件
const copyFileExt = ['png', 'jpeg', 'jpg', 'ico', 'gif'];

// 读取所有文件，并整理为ts模板
const project2TsTemplate = function (dirName) {
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
                    console.log('忽略文件：' + fileName);
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
                    // 路径
                    const pathAndName = pathAndFile.filter(it => it !== '.');
                    const fileNameStr = pathAndName.pop() || '';
                    // 记录模版信息
                    tmpls.push({
                        name: fileNameStr,
                        paths: pathAndName,
                        content: sourceFileContentStr,
                        extension: ext,
                        // 读取配置文件
                        ...readTmplConfig(fileName, dirName)
                    });
                }
            }
        },
        beforeFolderReadHandler: folder => !isIgnore(toAbsPath(folder).fullName)
    });
    // 把所有模版写入json文件
    fs.writeFileSync(tmplJsonName, JSON.stringify(tmpls));
};

// 转换为模板
const toTmplJson = function (workDir) {
    console.log(`工作目录：${workDir}`);
    // 开始工作
    project2TsTemplate(workDir, workDir);
    console.log(`生成模板完毕，请验证！！！`);
};

// 写入文件
const config2Folder = function (tmplList, rootDir) {
    // 先创建文件夹
    fs.mkdirSync(rootDir, { recursive: true });
    // 循环生成文件
    for (const tmpl of tmplList.filter(it => typeof it === 'object' && it)) {
        const { title, forLoopFilename, forLoopItem, forLoopDs, name, paths, content, extension } = tmpl;
        // 循环创建文件夹
        if (paths && paths.length > 0) {
            fs.mkdirSync(path.resolve(rootDir, paths.join('/')), { recursive: true });
        }
        // 写入文件
        const fileName = path.resolve(rootDir, [...(paths || []), [name, extension].filter(it => it).join('.')].filter(it => it).join('/'));
        fs.writeFileSync(fileName, content);
        // 写入配置文件
        const defaltTitle = '模板文件';
        if ((title && !['模板页面', defaltTitle].includes(title)) || forLoopFilename || forLoopItem || forLoopDs) {
            fs.writeFileSync(
                genTmplConfigName(fileName),
                [
                    `// 模板名称 \nconst title = '${title || defaltTitle}';`,
                    `// 循环文件名字（ejs）\nconst forLoopFilename = '${forLoopFilename || ''}';`,
                    `// 循环子项（循环命名）\nconst forLoopItem = '${forLoopItem || ''}';`,
                    `// 循环数据源Promise函数（入参是项目数据）\nconst forLoopDs = ${forLoopDs || 'null'}`
                ].join('\n\n')
            );
        }
    }
};

(function (pwd, type, ...args) {
    if (type === 'config2Folder') {
        (function (confFileName, dir) {
            if (!confFileName) {
                console.log('配置文件名不存在，第三个参数请传入配置文件名字');
            } else {
                const confFile = path.resolve(pwd, confFileName);
                if (fs.existsSync(confFile)) {
                    const json = fs.readFileSync(confFile).toString();
                    config2Folder(JSON.parse(json), path.resolve(pwd, dir || './'));
                } else {
                    console.log('配置文件名不正确，第三个参数请传入正确配置文件名字', confFile);
                }
            }
        })(...args);
    } else if (type === 'toConfig') {
        // 转配置
        toTmplJson(pwd);
    } else {
        console.log('第一个参数Type：只允许传入：config2Folder | toConfig', { type });
    }
})(process.cwd(), ...process.argv.slice(2));
