export const checkIsCookieRestrictedBrowser = (userAgent: string): boolean => {
    // All iOS browsers
    const isIOS = /iP(hone|ad|od)/i.test(userAgent);

    // Safari on macOS (exclude Chrome/Edge/Firefox/Opera)
    const isMacSafari =
        /Macintosh/i.test(userAgent) &&
        /Safari/i.test(userAgent) &&
        !/Chrome|Chromium|Edg|OPR|FxiOS|CriOS/i.test(userAgent);

    return isIOS || isMacSafari;
};
