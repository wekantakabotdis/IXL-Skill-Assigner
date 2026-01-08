

const humanDelay = () => {
  return 1000 + Math.random() * 2000;
};

const shortDelay = () => {
  return 100 + Math.random() * 200;
};

const humanClick = async (page, selector) => {
  await page.hover(selector);
  await page.waitForTimeout(shortDelay());
  await page.click(selector);
};

const humanType = async (page, selector, text) => {
  await page.click(selector);
  await page.waitForTimeout(shortDelay());
  for (const char of text) {
    await page.keyboard.type(char);
    await page.waitForTimeout(50 + Math.random() * 100);
  }
};

module.exports = {
  humanDelay,
  shortDelay,
  humanClick,
  humanType
};
