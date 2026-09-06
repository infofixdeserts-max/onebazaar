/* OneBazaar config - edit these, no rebuild needed */
window.OB_CONFIG = {
  SITE_NAME: "OneBazaar",
  TAGLINE: "Buy it. Sell it. Want it.",
  // Live backend (your OMEN EverythingHub API). Empty = demo mode on this device.
  // Example: "http://192.168.1.10:8895" then Settings -> Connect.
  API_BASE: "",
  // Create two free products at stripe.com -> Payment Links, paste the URLs here.
  // Set each link's "After payment" redirect to:
  //   https://infofixdeserts-max.github.io/onebazaar/?paid=premium   (Premium link)
  //   https://infofixdeserts-max.github.io/onebazaar/?paid=feature    (Featured link)
  STRIPE_LINK: "",
  FEATURE_LINK: "",
  FEATURE_PRICE: "$1",
  // Google AdSense publisher ID (ca-pub-...). Empty = tasteful house ads only.
  ADSENSE_CLIENT: "",
  PREMIUM_PRICE: "$2/mo"
};
