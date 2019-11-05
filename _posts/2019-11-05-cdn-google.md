---
categories: Uncategoried
layout: post
published: true
tags: -CF Workers
      - 镜像
      - 反代
      
title: 基于 CF Workers 反代 Google 制作镜像站
---

2019-11-05 10:22:46

某位狗子朋友的 Mac 版本过旧导致无法安装 $$R 客户端，于是我制作了这个谷歌镜像站，无需科学上网也可直连。

https://google.jinsblog.workers.dev/

[跳过废话看技术支持](#build)

##一点简介

> Cloudflare Workers 的名字来源于 Web Workers 以及更特别的 Service Workers，这个 W3C 标准 API 针对的是在浏览器后台运行并拦截 HTTP 请求的脚本。Cloudflare Workers 是使用同样的标准API编写的，但是在 Cloudflare 的服务器上运行，而不是在浏览器中。

对 Cloudflare (以下简称 CF) 这家公司一直很有好感，不仅功能强大，且允许个体开发者免费使用。本博客的域名解析服务以及上篇中科学上网的 CDN 转发正是由 CF 提供。

通常 Web 应用程序代码会分为两部分，一部分基于服务器，另一部分基于浏览器。一个庞大的哑网络负责两者之间点对点的数据传输。

而在真正的云计算中，代码在最需要它的地方运行 —— 在响应德国用户时，代码就在德国运行；在处理数据库里的数据时，代码就在存储数据的机器上运行；在和第三方 API 交互时，代码就在托管 API 的地方运行。当人类探险者到达火星时，~~代码则需要在火星上运行~~ —— 毕竟探险者们不会愿意花一个半小时的时间等待 App 响应。

CF Workers 正向着这个方向迈进，当部署一个 Worker 时，它会在30秒之内部署到 CF 的整个边缘网络，全世界100多个地点。域中的每个请求都会由离用户更近地点的 Worker 来处理，基于此来实现代码的“随处运行”。

<p id = "build"></p>

## 技术实现

该 Workers-Proxy 项目是一个轻量级的 JavaScript 应用程序，部署在 CF 上作为客户端从其他服务器检索资源，来实现自定义反向代理的构建，而无需购买计算引擎或配置 Nginx 等 Web 服务器。

程序会通过 CF 遍布90多个国家/地区的全球数据中心网络进行分发，所以延迟和可用性将得到极大优化。

通过配置地址和IP地址过滤器可以禁止特定国家或地区使用反代服务；利用移动重定向器可以根据用户的设备来分发不同的网页。


```javascript
// Website you intended to retrieve for users.
const upstream = 'www.google.com'

// Website you intended to retrieve for users using mobile devices.
const upstream_mobile = 'www.google.com'

// Countries and regions where you wish to suspend your service.
const blocked_region = ['KP', 'SY', 'PK', 'CU']

// IP addresses which you wish to block from using your service.
const blocked_ip_address = ['0.0.0.0', '127.0.0.1']

// Replace texts.
const replace_dict = {
    '$upstream': '$custom_domain',
    '//google.com': ''
}

addEventListener('fetch', event => {
    event.respondWith(fetchAndApply(event.request));
})

async function fetchAndApply(request) {

    const region = request.headers.get('cf-ipcountry').toUpperCase();
    const ip_address = request.headers.get('cf-connecting-ip');
    const user_agent = request.headers.get('user-agent');

    let response = null;
    let url = new URL(request.url);
    let url_host = url.host;

    if (url.protocol == 'http:') {
        url.protocol = 'https:'
        response = Response.redirect(url.href);
        return response;
    }

    if (await device_status(user_agent)) {
        var upstream_domain = upstream;
    } else {
        var upstream_domain = upstream_mobile;
    }

    url.host = upstream_domain;

    if (blocked_region.includes(region)) {
        response = new Response('Access denied: WorkersProxy is not available in your region yet.', {
            status: 403
        });
    } else if(blocked_ip_address.includes(ip_address)){
        response = new Response('Access denied: Your IP address is blocked by WorkersProxy.', {
            status: 403
        });
    } else{
        let method = request.method;
        let request_headers = request.headers;
        let new_request_headers = new Headers(request_headers);

        new_request_headers.set('Host', upstream_domain);
        new_request_headers.set('Referer', url.href);

        let original_response = await fetch(url.href, {
            method: method,
            headers: new_request_headers
        })

        let original_response_clone = original_response.clone();
        let original_text = null;
        let response_headers = original_response.headers;
        let new_response_headers = new Headers(response_headers);
        let status = original_response.status;

        new_response_headers.set('cache-control' ,'public, max-age=14400')
        new_response_headers.set('access-control-allow-origin', '*');
        new_response_headers.set('access-control-allow-credentials', true);
        new_response_headers.delete('content-security-policy');
        new_response_headers.delete('content-security-policy-report-only');
        new_response_headers.delete('clear-site-data');

        const content_type = new_response_headers.get('content-type');
        if (content_type.includes('text/html') && content_type.includes('UTF-8')) {
            original_text = await replace_response_text(original_response_clone, upstream_domain, url_host);
        } else {
            original_text = original_response_clone.body
        }

        response = new Response(original_text, {
            status,
            headers: new_response_headers
        })
    }
    return response;
}

async function replace_response_text(response, upstream_domain, host_name) {
    let text = await response.text()

    var i, j;
    for (i in replace_dict) {
        j = replace_dict[i]
        if (i == '$upstream') {
            i = upstream_domain
        } else if (i == '$custom_domain') {
            i = host_name
        }
        
        if (j == '$upstream') {
            j = upstream_domain
        } else if (j == '$custom_domain') {
            j = host_name
        }

        let re = new RegExp(i, 'g')
        text = text.replace(re, j);
    }
    return text;
}


async function device_status (user_agent_info) {
    var agents = ["Android", "iPhone", "SymbianOS", "Windows Phone", "iPad", "iPod"];
    var flag = true;
    for (var v = 0; v < agents.length; v++) {
        if (user_agent_info.indexOf(agents[v]) > 0) {
            flag = false;
            break;
        }
    }
    return flag;
}
```

最后上一张效果图：

![img](/img/cfgoogle.png)














