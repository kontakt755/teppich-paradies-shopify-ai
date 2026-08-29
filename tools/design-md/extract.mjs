// Headless driver that replaces the Chrome extension popup/content-script pair.
// The page function below is a verbatim port of extractStylesFromPage() and its
// helpers from bergside/design-md-chrome content-script.js.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { normalizeExtractedStyles } from "./lib/normalize.mjs";
import { generateDesignMarkdown } from "./lib/generate-design-md.mjs";
import { generateSkillMarkdown } from "./lib/generate-skill-md.mjs";

const EXTRACTOR = () => {
  function normalizeWhitespace(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  }

  function collectSampledElements(limit) {
    const selectors = [
      "body",
      "h1,h2,h3,h4,h5,h6",
      "p",
      "a",
      "button",
      "input,textarea,select",
      "label",
      "nav,header,footer,main,section,article,aside",
      "ul li,ol li",
      "table,th,td",
      "[role='button']",
      "[class*='card']",
      "[class*='btn']",
      "[tabindex]"
    ];
    const seen = new Set();
    const output = [];
    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (seen.has(node)) continue;
        if (!isVisible(node)) continue;
        seen.add(node);
        output.push(node);
        if (output.length >= limit) return output;
      }
    }
    if (output.length === 0 && document.body) output.push(document.body);
    return output;
  }

  function collectComponentCounts() {
    const map = {
      buttons: "button, [role='button'], .btn, [class*='button']",
      links: "a[href]",
      inputs: "input, textarea, select",
      cards: ".card, [class*='card'], article",
      navigation: "nav, header",
      lists: "ul, ol",
      tables: "table"
    };
    return Object.entries(map).map(([type, selector]) => ({
      type,
      count: document.querySelectorAll(selector).length
    }));
  }

  function getMetaContent(name, property = false) {
    const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    const value = document.querySelector(selector)?.getAttribute("content");
    return normalizeWhitespace(value || "");
  }

  function collectTexts(selector, limit, maxLength) {
    const seen = new Set();
    const output = [];
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const text = normalizeWhitespace(node.innerText || node.textContent || "");
      if (!text || text.length > maxLength) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      output.push(text);
      if (output.length >= limit) break;
    }
    return output;
  }

  function countNodesByText(selector, keywords) {
    const nodes = document.querySelectorAll(selector);
    let count = 0;
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const text = normalizeWhitespace((node.innerText || node.textContent || "").toLowerCase());
      if (!text) continue;
      if (keywords.some((keyword) => text.includes(keyword))) count += 1;
    }
    return count;
  }

  function collectSiteSignals() {
    const title = document.title || "";
    const description = getMetaContent("description");
    const keywords = getMetaContent("keywords");
    const ogType = getMetaContent("og:type", true);
    const ogSiteName = getMetaContent("og:site_name", true);
    const appName = getMetaContent("application-name");

    const headings = collectTexts("h1, h2", 10, 120);
    const navTexts = collectTexts("nav a, nav button, header a, header button", 24, 50);
    const ctaTexts = collectTexts(
      "button, [role='button'], a[class*='button'], a[class*='btn'], input[type='submit']",
      24,
      40
    );

    const bodyText = normalizeWhitespace((document.body?.innerText || "").slice(0, 14000));

    return {
      title,
      description,
      keywords,
      ogType,
      ogSiteName,
      appName,
      pathname: window.location.pathname || "/",
      hostname: window.location.hostname || "",
      headings,
      navTexts,
      ctaTexts,
      textSample: bodyText,
      elementCounts: {
        forms: document.querySelectorAll("form").length,
        inputs: document.querySelectorAll("input, textarea, select").length,
        tables: document.querySelectorAll("table").length,
        codeBlocks: document.querySelectorAll("pre, code").length,
        articles: document.querySelectorAll("article").length,
        pricingSections: countNodesByText("section, div, article", ["pricing", "plans"]),
        productMarkers: document.querySelectorAll(
          "[itemtype*='Product'], [class*='product'], [id*='product'], [data-product]"
        ).length,
        authMarkers: countNodesByText("a, button, label, span", [
          "sign in",
          "log in",
          "login",
          "register",
          "dashboard",
          "workspace"
        ]),
        checkoutMarkers: countNodesByText("a, button, span", [
          "add to cart",
          "checkout",
          "buy now",
          "cart"
        ])
      }
    };
  }

  const sampledElements = collectSampledElements(280);
  const typography = [];
  const colors = [];
  const spacing = [];
  const radius = [];
  const shadows = [];
  const motion = [];

  for (const el of sampledElements) {
    const style = window.getComputedStyle(el);
    typography.push({
      fontFamily: normalizeWhitespace(style.fontFamily),
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing
    });
    colors.push({
      textColor: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      outlineColor: style.outlineColor
    });
    spacing.push({
      marginTop: style.marginTop,
      marginRight: style.marginRight,
      marginBottom: style.marginBottom,
      marginLeft: style.marginLeft,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft
    });
    radius.push(style.borderRadius);
    shadows.push(style.boxShadow);
    motion.push({
      transitionDuration: style.transitionDuration,
      transitionTimingFunction: style.transitionTimingFunction,
      animationDuration: style.animationDuration,
      animationTimingFunction: style.animationTimingFunction
    });
  }

  return {
    source: { url: window.location.href, title: document.title || "Untitled page" },
    sampledAt: new Date().toISOString(),
    totalElements: document.querySelectorAll("*").length,
    sampledElements: sampledElements.length,
    typography,
    colors,
    spacing,
    radius,
    shadows,
    motion,
    components: collectComponentCounts(),
    siteSignals: collectSiteSignals()
  };
};

// URLs come from the command line: node extract.mjs <url> [<url> ...]
const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("usage: node extract.mjs <url> [<url> ...]");
  process.exit(1);
}

const targets = urls.map((url) => ({ url, slug: slugifyHost(url) }));

function slugifyHost(url) {
  try {
    const parsed = new URL(url);
    const base = `${parsed.hostname}${parsed.pathname}`.replace(/^www\./, "");
    return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  } catch {
    return "target";
  }
}

const outDir = new URL("./out/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

// PLAYWRIGHT_CHROMIUM_PATH lets this run outside the preinstalled image layout.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

for (const target of targets) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "de-DE",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(6000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    const payload = await page.evaluate(EXTRACTOR);
    const normalized = normalizeExtractedStyles(payload);

    writeFileSync(`${outDir}${target.slug}.raw.json`, JSON.stringify(payload, null, 2));
    writeFileSync(`${outDir}${target.slug}.normalized.json`, JSON.stringify(normalized, null, 2));
    writeFileSync(`${outDir}${target.slug}.DESIGN.md`, generateDesignMarkdown({ normalized, metadata: {} }));
    writeFileSync(`${outDir}${target.slug}.SKILL.md`, generateSkillMarkdown({ normalized, metadata: {} }));
    await page.screenshot({ path: `${outDir}${target.slug}.png`, fullPage: false });

    console.log(
      `[ok] ${target.slug}: sampled ${normalized.sampledElements}/${normalized.totalElements} elements, ` +
        `${normalized.colorPalette.length} colors, ${normalized.typographyScale.length} sizes, ` +
        `surface=${normalized.siteProfile.productSurface} (${normalized.siteProfile.confidence})`
    );
  } catch (error) {
    console.error(`[fail] ${target.slug}: ${error.message}`);
  } finally {
    await context.close();
  }
}

await browser.close();
