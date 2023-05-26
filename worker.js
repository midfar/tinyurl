const config = {
  noRef: "off", // Control the HTTP referrer header, if you want to create an anonymous link that will hide the HTTP Referer header, please set to "on" .
  theme: "", // Homepage theme, use the empty value for default theme. To use urlcool theme, please fill with "theme/urlcool" .
  cors: "on", // Allow Cross-origin resource sharing for API requests.
  uniqueLink: true, // If it is true, the same long url will be shorten into the same short url
  safeBrowsingApiKey: "", // Enter Google Safe Browsing API Key to enable url safety check before redirect.
};

const html404 = `<!DOCTYPE html>
<body>
  <h1>404 Not Found.</h1>
  <p>The url you visit is not found.</p>
  <a href="https://github.com/midfar" target="_self">Fork me on GitHub</a>
</body>`;

let responseHeader = {
  "content-type": "text/html;charset=UTF-8",
};

if (config.cors === "on") {
  responseHeader = {
    "content-type": "text/html;charset=UTF-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
  };
}

async function randomString(length) {
  const len = length || 6;
  const $chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';    /** **默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1****/
  const maxPos = $chars.length;
  let result = '';
  for (let i = 0; i < len; i++) {
    result += $chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return result;
}

async function sha512(theUrl) {
  const url = new TextEncoder().encode(theUrl);

  const urlDigest = await crypto.subtle.digest(
    {
      name: "SHA-512",
    },
    url, // The data you want to hash as an ArrayBuffer
  );
  const hashArray = Array.from(new Uint8Array(urlDigest)); // convert buffer to byte array
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  // console.log(hashHex)
  return hashHex;
}

async function checkUrl(urlString) {
  const str = urlString;
  const Expression = /http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?/;
  const objExp = new RegExp(Expression);
  if (objExp.test(str) === true) {
    if (str[0] === 'h') {
      return true;
    }
    return false;
  }
  return false;
}

async function saveUrl(urlString) {
  const randomKey = await randomString();
  const isExist = await LINKS.get(randomKey);
  if (isExist === null) {
    await LINKS.put(randomKey, urlString);
    return randomKey;
  }
  saveUrl(urlString);
}

async function isUrlExist(urlSha512) {
  const isExist = await LINKS.get(urlSha512);
  if (isExist === null) {
    return false;
  }
  return isExist;
}

async function isUrlSafe(url) {
  const raw = JSON.stringify({
    client: {
      clientId: "Url-Shorten-Worker",
      clientVersion: "1.0.7",
    },
    threatInfo: {
      threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "POTENTIALLY_HARMFUL_APPLICATION", "UNWANTED_SOFTWARE"],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: [{ url }],
    },
  });

  const requestOptions = {
    method: 'POST',
    body: raw,
    redirect: 'follow',
  };

  let result = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${config.safeBrowsingApiKey}`, requestOptions);
  result = await result.json();
  // console.log(result);
  if (Object.keys(result).length === 0) {
    return true;
  }
  return false;
}

async function handleRequest(request) {
  // console.log(request);
  if (request.method === "POST") {
    const req = await request.json();
    // console.log(req.url);
    if (!await checkUrl(req.url)) {
      return new Response(`{"status":500,"key":": Error: Url illegal."}`, {
        headers: responseHeader,
      });
    }
    let randomKey;
    if (config.uniqueLink) {
      const urlSha512 = await sha512(req.url);
      const urlKey = await isUrlExist(urlSha512);
      if (urlKey) {
        randomKey = urlKey;
      } else {
        randomKey = await saveUrl(req.url);
        await LINKS.put(urlSha512, randomKey);
      }
    } else {
      randomKey = await saveUrl(req.url);
    }
    return new Response(`{"status":200,"key":"/${randomKey}"}`, {
      headers: responseHeader,
    });
  } if (request.method === "OPTIONS") {
    return new Response(``, {
      headers: responseHeader,
    });
  }

  const requestURL = new URL(request.url);
  // eslint-disable-next-line prefer-destructuring
  const path = requestURL.pathname.split("/")[1];
  const params = requestURL.search;

  // console.log(path);
  if (!path) {
    const html = await fetch("https://tinyurl-67r.pages.dev/index.html");

    return new Response(await html.text(), {
      headers: {
        "content-type": "text/html;charset=UTF-8",
      },
    });
  }

  const value = await LINKS.get(path);
  let location;

  if (params) {
    location = value + params;
  } else {
    location = value;
  }
  // console.log(value);

  if (location) {
    if (config.safeBrowsingApiKey) {
      if (!(await isUrlSafe(location))) {
        const warningResp = await fetch("https://tinyurl-67r.pages.dev/safe-browsing.html");
        let warningText = await warningResp.text();
        warningText = warningText.replace(/{Replace}/gm, location);
        return new Response(warningText, {
          headers: {
            "content-type": "text/html;charset=UTF-8",
          },
        });
      }
    }
    if (config.noRef === "on") {
      const noRefResp = await fetch("https://tinyurl-67r.pages.dev/no-ref.html");
      let noRefText = await noRefResp.text();
      noRefText = noRefText.replace(/{Replace}/gm, location);
      return new Response(noRefText, {
        headers: {
          "content-type": "text/html;charset=UTF-8",
        },
      });
    }
    return Response.redirect(location, 302);
  }
  // If request not in kv, return 404
  return new Response(html404, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
    },
    status: 404,
  });
}

addEventListener("fetch", async (event) => {
  event.respondWith(handleRequest(event.request));
});
