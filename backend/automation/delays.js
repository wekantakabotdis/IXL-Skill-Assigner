

const humanDelay = () => {
  return 500 + Math.random() * 500;
};

const shortDelay = () => {
  return 50 + Math.random() * 100;
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
    await page.waitForTimeout(20 + Math.random() * 50);
  }
};

module.exports = {
  humanDelay,
  shortDelay,
  humanClick,
  humanType
};
