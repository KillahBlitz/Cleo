export default defineEventHandler(async event => ({ profile: profileData(await currentBidder(event)) }))
