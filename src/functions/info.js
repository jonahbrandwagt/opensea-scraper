// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
const puppeteer = require('puppeteer-extra');
// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// load helper function to detect stealth plugin
const { warnIfNotUsingStealth } = require("../helpers/helperFunctions.js");

const info = async (contract, slug, optionsGiven = {}) => {
  const url = `https://opensea.io/assets/ethereum/${contract}/${slug}`
  return await infoByUrl(url, optionsGiven);
}


const infoByUrl = async (url, optionsGiven = {}) => {
  const optionsDefault = {
    debug: false,
    logs: false,
    sort: true, // sorts the returned offers by lowest to highest price
    browserInstance: undefined,
  };
  const options = { ...optionsDefault, ...optionsGiven };
  const { debug, logs, browserInstance, sort } = options;
  const customPuppeteerProvided = Boolean(optionsGiven.browserInstance);

  logs && console.log(`=== scraping started ===\nScraping Opensea URL: ${url}`);
  logs && console.log(`\n=== options ===\ndebug          : ${debug}\nlogs           : ${logs}\nbrowserInstance: ${browserInstance ? "provided by user" : "default"}`);

  // init browser
  let browser = browserInstance;
  if (!customPuppeteerProvided) {
    browser = await puppeteer.launch({
      headless: !debug, // when debug is true => headless should be false
      args: ['--start-maximized'],
    });
  }
  customPuppeteerProvided && warnIfNotUsingStealth(browser);

  logs && console.log("\n=== actions ===");
  logs && console.log("new page created");
  const page = await browser.newPage();
  logs && console.log(`opening url ${url}`);
  await page.goto(url);

  // ...🚧 waiting for cloudflare to resolve
  logs && console.log("🚧 waiting for cloudflare to resolve...");
  await page.waitForSelector('.cf-browser-verification', {hidden: true});

  // extract __wired__ variable
  logs && console.log("extracting __wired__ variable");
  const html = await page.content();
  const __wired__ = _parseWiredVariable(html);

  if (!customPuppeteerProvided && !debug) {
    logs && console.log("closing browser...");
    await browser.close();
  }

  logs && console.log("extracting offers and stats from __wired__ variable");
  return {
    info: _parseInfo_(__wired__, url),
  }
}

function _parseWiredVariable(html) {
  const str = html.split("window.__wired__=")[1].split("</script>")[0];
  return JSON.parse(str);
}

function _parseInfo_(__wired__, url) {
    const dict = {}

    //get info
    Object.values(__wired__.records)
    .filter(o => o.__typename === "AssetType")
    .filter(o => o.name)
    .map(record => {
        dict.name = record.name;
        dict.contract = record.assetContract["__ref"]
        dict.url = url
        dict.favorites = record.favoritesCount;
        dict.image = record.displayImageUrl;
        dict.views = record.numVisitors;
        dict.price = 0
    })

    //get price
    Object.values(__wired__.records)
    .filter(o => o.__typename === "AssetQuantityType")
    .filter(o => o.quantity)
    .map(record => {
        if(record.quantity != "1") { 
            dict.price = record.quantity / 1000000000000000000
        }
    })

    //get owner
    Object.values(__wired__.records)
    .filter(o => o.__typename === "AccountType")
    .filter(o => o.address)
    .map(record => {
        dict.owner = {}
        dict.owner.address = record.address
        dict.owner.image = record.imageUrl
    })

    return dict
}

module.exports = info;