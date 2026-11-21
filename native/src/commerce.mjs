const entitlementId = 'full_arcade';
const defaultProductId = 'stellar_rebels_full_arcade';
const platformStores = {
  ios: { store: 'APP_STORE', key: 'iosKey', prefix: 'appl_', product: 'iosProductId' },
  android: { store: 'PLAY_STORE', key: 'androidKey', prefix: 'goog_', product: 'androidProductId' }
};

export function resolveCommerceConfig(platform, config) {
  const testStore = config?.mode === 'test-store';
  const store = testStore && platform === 'android'
    ? { store: 'TEST_STORE', key: 'testKey', prefix: 'test_', product: 'testProductId' }
    : config?.mode === 'platform' && platformStores[platform];
  if (!store) return null;
  const apiKey = config[store.key];
  if (typeof apiKey !== 'string' || !new RegExp(`^${store.prefix}[A-Za-z0-9]+$`).test(apiKey)) return null;
  return { store: store.store, apiKey, productId: config[store.product] || defaultProductId };
}

export function isArcadeStage(stage) {
  return Number.isInteger(stage) && stage >= 1 && stage <= 6;
}

export function createCommerce(sdk, { platform, config, nativeAvailable }) {
  const settings = nativeAvailable ? resolveCommerceConfig(platform, config) : null;
  const listeners = new Set();
  const errors = sdk.PURCHASES_ERROR_CODE;
  const verification = sdk.VERIFICATION_RESULT;
  let starting, checkingCustomer, checkingOffering;
  let selectedPackage = null;
  let lastRequest = -Infinity;
  let current = { owned: false, price: null, available: false, restoreAvailable: false, pending: false, busy: false, revision: 0 };

  function update(changes) {
    if (!Object.entries(changes).some(([key, value]) => current[key] !== value)) return;
    current = { ...current, ...changes, revision: current.revision + 1 };
    for (const listener of listeners) listener(current);
  }

  function applyCustomerInfo(info, { authoritative = false, completedRestore = false } = {}) {
    const requestTime = Date.parse(info?.requestDate);
    if (!info?.entitlements || !Number.isFinite(requestTime) || requestTime < lastRequest ||
        (!authoritative && requestTime === lastRequest)) return;
    lastRequest = requestTime;
    const entitlement = info.entitlements.active?.[entitlementId];
    const owned = entitlement?.isActive === true && entitlement.expirationDate === null &&
      entitlement.productIdentifier === settings.productId && entitlement.store === settings.store &&
      (entitlement.verification === verification.VERIFIED || entitlement.verification === verification.VERIFIED_ON_DEVICE);
    update(owned || (completedRestore && !entitlement) ? { owned, pending: false } : { owned });
  }

  const customerUpdated = (info) => applyCustomerInfo(info, { authoritative: true });

  async function initialize() {
    if (!settings) return false;
    starting ??= (async () => {
      sdk.configure({
        apiKey: settings.apiKey,
        entitlementVerificationMode: sdk.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
        automaticDeviceIdentifierCollectionEnabled: false
      });
      const configured = await sdk.isConfigured();
      update({ restoreAvailable: configured });
      return configured;
    })().catch(() => false);
    return starting;
  }

  function refreshCustomer() {
    checkingCustomer ??= (async () => {
      if (await initialize()) applyCustomerInfo(await sdk.getCustomerInfo());
    })().catch(() => {
      // A temporary outage leaves the most recently verified SDK state available.
    }).finally(() => { checkingCustomer = undefined; });
    return checkingCustomer;
  }

  function refreshOffering() {
    checkingOffering ??= (async () => {
      if (!await initialize()) return;
      const offerings = await sdk.getOfferings();
      const packages = offerings.current?.availablePackages;
      const candidate = packages?.length === 1 ? packages[0] : null;
      const product = candidate?.product;
      // RevenueCat's Android mapper labels every INAPP product CONSUMABLE.
      // The Google Play product must be marked non-consumable in RevenueCat.
      const validProduct = product?.identifier === settings.productId &&
        product.productCategory === sdk.PRODUCT_CATEGORY.NON_SUBSCRIPTION &&
        product.subscriptionPeriod === null && (platform !== 'ios' || product.productType !== 'CONSUMABLE') &&
        typeof product.priceString === 'string' && product.priceString.trim().length > 0;
      const available = validProduct && (settings.store === 'TEST_STORE' || await sdk.canMakePayments());
      selectedPackage = available ? candidate : null;
      update({ available, price: available ? product.priceString : null });
    })().catch(() => {
      selectedPackage = null;
      update({ available: false, price: null });
    }).finally(() => { checkingOffering = undefined; });
    return checkingOffering;
  }

  async function authorize(stage) {
    if (!isArcadeStage(stage)) return { allowed: false };
    if (stage <= 3) return { allowed: true };
    let timer;
    await Promise.race([
      refreshCustomer(),
      new Promise((resolve) => { timer = setTimeout(resolve, 1250); })
    ]);
    clearTimeout(timer);
    return { allowed: current.owned };
  }

  const outcome = (result) => ({ ...current, result });

  async function order(restore) {
    if (!current.restoreAvailable || current.busy) return outcome('unavailable');
    if (!restore && current.owned) return outcome('purchased');
    if (!restore && current.pending) return outcome('pending');
    if (!restore && !selectedPackage) return outcome('unavailable');
    update({ busy: true });
    let result;
    try {
      const restored = restore ? await sdk.restorePurchases() : null;
      const purchased = restore ? null : await sdk.purchasePackage(selectedPackage);
      if (purchased && purchased.productIdentifier !== settings.productId) {
        result = 'failed';
      } else {
        const info = restored ?? purchased?.customerInfo;
        // A completed store restore can release a stuck pending screen. The
        // store still controls whether the buyer can place another order.
        applyCustomerInfo(info, { authoritative: true, completedRestore: restore });
        const foundEntitlement = Boolean(info?.entitlements?.active?.[entitlementId]);
        result = current.owned ? (restore ? 'restored' : 'purchased') :
          (current.pending ? 'pending' : (restore && !foundEntitlement ? 'nothing' : 'failed'));
      }
    } catch (error) {
      const code = error?.code;
      if (code === errors.PAYMENT_PENDING_ERROR) {
        update({ pending: !current.owned });
        result = current.owned ? (restore ? 'restored' : 'purchased') : 'pending';
      } else if (code === errors.PURCHASE_CANCELLED_ERROR) {
        result = 'cancelled';
      } else if (code === errors.PRODUCT_ALREADY_PURCHASED_ERROR) {
        await refreshCustomer();
        result = current.owned ? 'purchased' : 'failed';
      } else if ([errors.NETWORK_ERROR, errors.OFFLINE_CONNECTION_ERROR, errors.INVALID_CREDENTIALS_ERROR,
        errors.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR, errors.PURCHASE_NOT_ALLOWED_ERROR].includes(code) && code) {
        result = 'unavailable';
      } else {
        result = 'failed';
      }
    } finally {
      update({ busy: false });
    }
    return outcome(result);
  }

  return {
    status: () => current,
    refresh: async () => Promise.all([refreshCustomer(), refreshOffering()]),
    authorize,
    purchase: () => order(false),
    restore: () => order(true),
    unavailable: () => outcome('unavailable'),
    subscribe(listener) {
      if (settings && listeners.size === 0) sdk.addCustomerInfoUpdateListener(customerUpdated);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (settings && listeners.size === 0) sdk.removeCustomerInfoUpdateListener(customerUpdated);
      };
    }
  };
}
