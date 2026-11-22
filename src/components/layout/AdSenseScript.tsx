import Script from 'next/script'
import { adsenseScriptSrc, configuredPublisherId } from '@/lib/ads'

// Loads the Google AdSense library on public pages only (the admin and login screens live
// outside the (public) group, so no ads can be injected there). Renders nothing until
// ADSENSE_PUBLISHER_ID is set to a valid publisher ID.
//
// Consent: for visitors in the EEA, UK and Switzerland Google requires a certified consent
// banner. Create it in AdSense > Privacy & messaging > European regulations; Google serves it
// through this same script, so no extra code is needed here.
export function AdSenseScript() {
  const publisherId = configuredPublisherId()
  if (!publisherId) return null
  return (
    <Script
      id="adsense-loader"
      async
      src={adsenseScriptSrc(publisherId)}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  )
}
