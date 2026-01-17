const fs = require('fs');
const path = require('path');

class I18n {
  constructor() {
    this.currentLocale = 'en';
    this.translations = {};
    this.availableLocales = ['en', 'fr'];
    this.localesPath = __dirname;
  }

  async init(locale = 'en') {
    this.currentLocale = locale;
    await this.loadTranslations(locale);
    return this;
  }

  async loadTranslations(locale) {
    try {
      const filePath = path.join(this.localesPath, `${locale}.json`);
      const data = fs.readFileSync(filePath, 'utf8');
      this.translations = JSON.parse(data);
      return true;
    } catch (error) {
      console.error(`Failed to load translations for locale: ${locale}`, error);
      if (locale !== 'en') {
        await this.loadTranslations('en');
      }
      return false;
    }
  }

  async changeLocale(locale) {
    if (!this.availableLocales.includes(locale)) {
      console.warn(`Locale ${locale} is not available`);
      return false;
    }

    this.currentLocale = locale;
    await this.loadTranslations(locale);

    if (typeof window !== 'undefined') {
      this.updateDOM();
    }

    return true;
  }

  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
    }

    if (typeof value !== 'string') {
      console.warn(`Translation value is not a string for key: ${key}`);
      return key;
    }

    return this.interpolate(value, params);
  }

  interpolate(text, params) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }

  updateDOM() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((element) => {
      const key = element.getAttribute('data-i18n');
      const params = this.getDataParams(element);

      if (element.hasAttribute('data-i18n-placeholder')) {
        element.placeholder = this.t(key, params);
      } else if (element.hasAttribute('data-i18n-title')) {
        element.title = this.t(key, params);
      } else {
        element.textContent = this.t(key, params);
      }
    });

    document.documentElement.lang = this.currentLocale;
  }

  getDataParams(element) {
    const params = {};
    const attributes = element.attributes;

    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      if (attr.name.startsWith('data-i18n-param-')) {
        const paramName = attr.name.replace('data-i18n-param-', '');
        params[paramName] = attr.value;
      }
    }

    return params;
  }

  getAvailableLocales() {
    return this.availableLocales;
  }

  getCurrentLocale() {
    return this.currentLocale;
  }

  addLocale(locale) {
    if (!this.availableLocales.includes(locale)) {
      this.availableLocales.push(locale);
    }
  }
}

let i18nInstance = null;

async function getI18n(locale) {
  if (!i18nInstance) {
    i18nInstance = new I18n();
    await i18nInstance.init(locale);
  }
  return i18nInstance;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { I18n, getI18n };
}
