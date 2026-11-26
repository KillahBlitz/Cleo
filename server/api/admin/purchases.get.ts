export default defineEventHandler(async event => { await requireAdmin(event); return listPurchases(event) })
