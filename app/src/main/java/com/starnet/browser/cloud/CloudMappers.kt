package com.starnet.browser.cloud

import com.starnet.browser.cloud.net.CloudAccountDetail
import com.starnet.browser.cloud.net.CloudAccountSummary
import com.starnet.browser.data.AccountProfile
import com.starnet.browser.data.DeviceStatus

/**
 * Reuses the existing (already validated) day-grouped account list and
 * editor UI - [com.starnet.browser.ui.AccountListScreen],
 * [com.starnet.browser.ui.AccountEditorDialog] - for cloud accounts too, by
 * mapping the cloud API's data shape into the same [AccountProfile] the
 * local-WebView flow uses for display. Nothing here is persisted locally;
 * it exists only to drive the shared Composables for one recomposition.
 */
fun CloudAccountSummary.toAccountProfile(): AccountProfile = AccountProfile(
    id = id,
    name = name,
    deviceName = deviceName,
    kitNumber = kitNumber,
    serialNumber = serialNumber,
    standbyDate = standbyDate,
    rechargeDate = rechargeDate,
    balanceDue = balanceDue,
    currency = currency,
    dishStatus = DeviceStatus.from(dishStatus),
    wifiStatus = DeviceStatus.from(wifiStatus),
    alertReason = alertReason,
    lastUpdated = lastUpdated,
    planName = planName
)

fun CloudAccountDetail.toAccountProfile(): AccountProfile = summary.toAccountProfile().copy(
    email = email,
    emailSecret = emailSecret,
    wifiCode = wifiCode,
    notes = notes,
    accountNumber = accountNumber,
    subscriptionId = subscriptionId,
    starlinkId = starlinkId,
    serviceStatus = serviceStatus,
    serviceLocation = serviceLocation,
    billingPeriod = billingPeriod,
    paymentDueDate = paymentDueDate,
    softwareVersion = softwareVersion,
    uptime = uptime
)
