// 忽略文件
var ignoreFile = "node_modules/**|output/**|.git/**|/fis*.js|package.json|.svn/**|dist/**|release/**|local/**|.idea/**|map.json|**.md";
fis.set('project.ignore', ignoreFile.split("|"));

// js文件cmd分析
fis.hook('commonjs');

// 为所有文件添加同名依赖
fis.match("**", {
  useSameNameRequire : true
});

// 为html文件添加 isPage 标签
fis.match("**.html", {
  extras: {
    isPage: true
  },
  isMod: true,
  useCache: false
});

// 不编译 module 下html文件
fis.match("module/**.html", {
  extras: {
    isPage: false
  },
  release : false
});


// module目录下的其他js、css文件
fis.match(/^\/module\/(.*\.(?:js|css))$/, {
  isMod: true,
  id: '$1',
  moduleId: '$1'
});

// module目录下目录与文件同名的js文件
fis.match(/^\/module\/([^\/]+)\/\1\.js$/, {
  isMod: true,
  id: '$1',
  moduleId: '$1'
});

// 与上条规则相似，只是一条正则不方便实现
fis.match(/^\/module\/(.*\/([^\/]+))\/\2\.js$/, {
  isMod: true,
  id: '$1',
  moduleId: '$1'
});


// 在travis-ci上构建时添加 /upup 路径作为前缀
if (process.env.GH_PAGES_DEPLOY) {
  // 默认开发环境
  fis.media('dev').match("**", {
    domain : "/upup"
  });
}

// 配置简单打包插件，按页面合并资源
fis.match('::packager', {
  postpackager : function (ret, conf, settings, opt){
    // 遍历所有源码文件
    for (var path in ret.src) {
        var file = ret.src[path];
        if (file.extras.isPage) {
            // 针对标记了isPage的文件进行资源合并处理
            pack(file, ret, opt);
        }
    }
  }
});



// 合并多个资源
function concat(path, res, pkg) {
    // 根据path参数创建一个新文件
    var file = fis.file(fis.project.getProjectPath(path));
    var content = [];
    // 遍历资源收集内容
    res.forEach(function (file) {
        content.push(file.getContent());
    });
    // 内容合并
    content = content.join((file.isJsLike ? ';' : '') + '\n');
    file.setContent(content);
    // 手工标记文件已被编译过
    file.compiled = true;
    pkg[file.subpath] = file;
    return [file];
}

// 生成资源引用地址
function genHTML(res, type, withHash, withDomain) {
    var left, right;
    if (type === 'js') {
        left = '<script src="';
        right = '"></script>';
    } else {
        left = '<link rel="stylesheet" href="';
        right = '"/>';
    }
    var html = '';
    // 遍历资源获取url生成html片段
    res.forEach(function (file) {
        html += left + file.getUrl(withHash, withDomain) + right + '\n';
    });
    return html;
}

// 以页面为单位进行打包合并
function pack(file, ret, opt) {
    var depsJS = [], depsCSS = [], added = {};
    var collect = function (file) {
        // 防止循环依赖
        if (added[file.origin]) return;
        added[file.origin] = 1;
        // 遍历依赖递归分析
        file.requires.forEach(function (id) {
            var f = ret.ids[id];
            if (f) collect(f);
            else console.error('[WARN] missing file', id);
        });
        // 资源收集
        if (file.isJsLike) {
            depsJS.push(file);
        } else if (file.isCssLike) {
            depsCSS.push(file);
        }
    };
    collect(file);
    if (opt.pack) {
        // 资源内容合并
        depsJS = concat('pkg/aio.js', depsJS, ret.pkg);
        depsCSS = concat('pkg/aio.css', depsCSS, ret.pkg);
    }
    // 生成资源引用的html片段
    var scripts = genHTML(depsJS, 'js', opt.md5, opt.domain);
    var styles = genHTML(depsCSS, 'css', opt.md5, opt.domain);
    var content = file.getContent();
    // 占位替换
    content = content
        .replace(/<!--\s*scripts\s*-->\s*/, scripts)
        .replace(/<!--\s*styles\s*-->\s*/, styles);
    file.setContent(content);
}