import removeAccents from 'remove-accents'

import { $, $$, downloadBlob } from './dom-utils'
import { addSlash, getFormattedDate } from './util'
import { generatePdf } from './pdf-util'
import SecureLS from 'secure-ls'
let context = 'curfew'
const secureLS = new SecureLS({ encodingType: 'aes' })
const clearDataSnackbar = $('#snackbar-cleardata')
const storeDataInput = $('#field-storedata')
const conditions = {
  '#field-firstname': {
    length: 1,
  },
  '#field-lastname': {
    length: 1,
  },
  '#field-birthday': {
    pattern: /^([0][1-9]|[1-2][0-9]|30|31)\/([0][1-9]|10|11|12)\/(19[0-9][0-9]|20[0-1][0-9]|2020)/g,
  },
  '#field-placeofbirth': {
    length: 1,
  },
  '#field-address': {
    length: 1,
  },
  '#field-city': {
    length: 1,
  },
  '#field-zipcode': {
    pattern: /\d{5}/g,
  },
  '#field-datesortie': {
    pattern: /\d{4}-\d{2}-\d{2}/g,
  },
  '#field-heuresortie': {
    pattern: /\d{2}:\d{2}/g,
  },
}

function validateAriaFields () {
  return Object.keys(conditions)
    .map((field) => {
      const fieldData = conditions[field]
      const pattern = fieldData.pattern
      const length = fieldData.length
      const isInvalidPattern = pattern && !$(field).value.match(pattern)
      const isInvalidLength = length && !$(field).value.length

      const isInvalid = !!(isInvalidPattern || isInvalidLength)

      $(field).setAttribute('aria-invalid', isInvalid)
      if (isInvalid) {
        $(field).focus()
      }
      return isInvalid
    })
    .includes(true)
}

function updateSecureLS (formInputs) {
  if (wantDataToBeStored() === true) {
    secureLS.set('profile', getProfile(formInputs))
  } else {
    clearSecureLS()
  }
}

function clearSecureLS () {
  secureLS.clear()
}

function clearForm () {
  const formProfile = $('#form-profile')
  formProfile.reset()
  storeDataInput.checked = false
}

function setCurrentDate (releaseDateInput) {
  const currentDate = new Date()
  releaseDateInput.value = getFormattedDate(currentDate)
}

function showSnackbar (snackbarToShow, showDuration = 6000) {
  snackbarToShow.classList.remove('d-none')
  setTimeout(() => snackbarToShow.classList.add('show'), 100)

  setTimeout(function () {
    snackbarToShow.classList.remove('show')
    setTimeout(() => snackbarToShow.classList.add('d-none'), 500)
  }, showDuration)
}

export function wantDataToBeStored () {
  return storeDataInput.checked
}

export function setReleaseDateTime (releaseDateInput) {
  const loadedDate = new Date()
  releaseDateInput.value = getFormattedDate(loadedDate)
}

export function toAscii (string) {
  if (typeof string !== 'string') {
    throw new Error('Need string')
  }
  const accentsRemoved = removeAccents(string)
  const asciiString = accentsRemoved.replace(/[^\x00-\x7F]/g, '') // eslint-disable-line no-control-regex
  return asciiString
}

export function getProfile (formInputs) {
  const fields = {}
  for (const field of formInputs) {
    let value = field.value
    if (field.id === 'field-datesortie') {
      const dateSortie = field.value.split('-')
      value = `${dateSortie[2]}/${dateSortie[1]}/${dateSortie[0]}`
    }
    if (typeof value === 'string') {
      value = toAscii(value)
    }
    fields[field.id.substring('field-'.length)] = value
  }
  return fields
}

export function getReasons (reasonInputs) {
  const reasons = reasonInputs
    .filter(input => input.checked)
    .map(input => input.value).join(', ')
  return reasons
}

export function prepareInputs (formInputs, reasonInputs, reasonFieldsetsWrapper, reasonAlerts, snackbar, releaseDateInput, contextWrapper) {
  const lsProfile = secureLS.get('profile')

  // Continue to store data if already stored
  storeDataInput.checked = !!lsProfile
  formInputs.forEach((input) => {
    if (input.name && lsProfile && input.name !== 'datesortie' && input.name !== 'heuresortie' && input.name !== 'field-reason') {
      input.value = lsProfile[input.name]
    }
    const exempleElt = input.parentNode.parentNode.querySelector('.exemple')
    if (input.placeholder && exempleElt) {
      input.addEventListener('input', (event) => {
        if (input.value) {
          updateSecureLS(formInputs)
          exempleElt.innerHTML = 'ex.&nbsp;: ' + input.placeholder
        } else {
          exempleElt.innerHTML = ''
        }
      })
    }
  })

  $('#field-birthday').addEventListener('keyup', function (event) {
    event.preventDefault()
    const input = event.target
    const key = event.keyCode || event.charCode
    if (key !== 8 && key !== 46) {
      input.value = addSlash(input.value)
    }
  })

  reasonInputs.forEach(radioInput => {
    radioInput.addEventListener('change', function (event) {
      const isInError = reasonInputs.every(input => !input.checked)
      reasonFieldsetsWrapper.classList.toggle('fieldset-error', isInError)
      reasonAlerts.map(reasonAlert => reasonAlert.classList.toggle('hidden', !isInError))
    })
  })
  $('#cleardata').addEventListener('click', () => {
    clearSecureLS()
    clearForm()
    setCurrentDate(releaseDateInput)
    showSnackbar(clearDataSnackbar, 3000)
  })
  $('#field-storedata').addEventListener('click', () => {
    updateSecureLS(formInputs)
  })
  $('#generate-btn').addEventListener('click', async (event) => {
    event.preventDefault()

    if ($$('.targeted').length === 0) {
      contextWrapper.classList.add('context-wrapper-error')
    }

    const reasons = getReasons(reasonInputs)
    if (!reasons) {
      reasonFieldsetsWrapper.classList.add('fieldset-error')
      reasonAlerts.map(reasonAlert => reasonAlert.classList.remove('hidden'))
      // reasonFieldsetsWrapper.scrollIntoView && reasonFieldsetsWrapper.scrollIntoView()
      return
    }

    const invalid = validateAriaFields()
    if (invalid) {
      return
    }
    updateSecureLS(formInputs)
    const pdfBlob = await generatePdf(getProfile(formInputs), reasons, context)

    const creationInstant = new Date()
    const creationDate = creationInstant.toLocaleDateString('fr-CA')
    const creationHour = creationInstant
      .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      .replace(':', '-')

    downloadBlob(pdfBlob, `attestation-${creationDate}_${creationHour}.pdf`)
    showSnackbar(snackbar, 6000)
  })

  const curfewFieldset = $('#curfew-reason-fieldset')
  const quarantineFieldset = $('#quarantine-reason-fieldset')
  const curfewSubtitle = $('.curfew-subtitle')
  const quarantineSubtitle = $('.quarantine-subtitle')

  // contextWrapper.classList.remove('context-wrapper-error')
  // reasonFieldsetsWrapper.classList.toggle('hidden', false)

  // curfewFieldset.classList.toggle('in-quarantine', false)
  // curfewFieldset.classList.toggle('targeted', true)
  // quarantineFieldset.classList.toggle('targeted', false)
  // curfewSubtitle.classList.toggle('hidden', false)
  // quarantineSubtitle.classList.toggle('hidden', true)

  $$('.context-button').map(anchor => anchor.addEventListener('click', (event) => {
    contextWrapper.classList.remove('context-wrapper-error')
    reasonFieldsetsWrapper.classList.toggle('hidden', false)
    if (event.target.className.includes('curfew-button')) {
      context = 'curfew'
      // curfewFieldset.classList.toggle('in-quarantine', false)
      curfewFieldset.classList.toggle('targeted', true)
      quarantineFieldset.classList.toggle('targeted', false)
      curfewSubtitle.classList.toggle('hidden', false)
      quarantineSubtitle.classList.toggle('hidden', true)
    }
    if (event.target.className.includes('quarantine-button')) {
      context = 'quarantine'
      // curfewFieldset.classList.toggle('in-quarantine', true)
      curfewFieldset.classList.toggle('targeted', false)
      quarantineFieldset.classList.toggle('targeted', true)
      curfewSubtitle.classList.toggle('hidden', true)
      quarantineSubtitle.classList.toggle('hidden', false)
    }
  }))
}

export function prepareForm () {
  const formInputs = $$('#form-profile input')
  const snackbar = $('#snackbar')
  const reasonInputs = [...$$('input[name="field-reason"]')]
  const reasonFieldsetsWrapper = $('.fieldset-wrapper')
  const reasonAlerts = $$('.msg-alert')
  const releaseDateInput = $('#field-datesortie')
  const contextWrapper = $('.context-wrapper')
  setReleaseDateTime(releaseDateInput)
  prepareInputs(formInputs, reasonInputs, reasonFieldsetsWrapper, reasonAlerts, snackbar, releaseDateInput, contextWrapper)
}
