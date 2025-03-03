/*
 * This file is part of the Companion project
 * Copyright (c) 2018 Bitfocus AS
 * Authors: William Viker <william@bitfocus.io>, Håkon Nessjøen <haakon@bitfocus.io>
 *
 * This program is free software.
 * You should have received a copy of the MIT licence as well as the Bitfocus
 * Individual Contributor License Agreement for companion along with
 * this program.
 *
 * You can be released from the requirements of the license by purchasing
 * a commercial license. Buying such a license is mandatory as soon as you
 * develop commercial activities involving the Companion software without
 * disclosing the source code of your own applications.
 *
 */

var debug = require('debug')('lib/bank')
var fs = require('fs')
var path = require('path')
var _ = require('lodash')
const rimraf = require('rimraf')

function rgb(r, g, b) {
	return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
}

function rgbRev(dec) {
	return {
		r: (dec & 0xff0000) >> 16,
		g: (dec & 0x00ff00) >> 8,
		b: dec & 0x0000ff,
	}
}

function bank(system) {
	var self = this

	self.config = {}

	self.fields = {
		png: [
			{
				type: 'textinput',
				id: 'text',
				label: 'Text',
				width: 6,
				default: '',
			},

			{
				type: 'dropdown',
				id: 'size',
				label: 'Font size',
				default: 'auto',
				choices: [
					{ id: '7', label: '7pt' },
					{ id: '14', label: '14pt' },
					{ id: '18', label: '18pt' },
					{ id: '24', label: '24pt' },
					{ id: '30', label: '30pt' },
					{ id: '44', label: '44pt' },
					{ id: 'auto', label: 'Auto' },
				],
				width: 3,
			},

			// Changed from 58 to 72 (Height)
			{
				type: 'filepicker',
				id: 'png',
				label: '72x58 PNG',
				accept: 'image/png',
				width: 3,
				imageMinWidth: 72,
				imageMinHeight: 58,
				imageMaxWidth: 72,
				imageMaxHeight: 72,
			},
			{
				type: 'alignmentcontrol',
				id: 'alignment',
				label: 'Text Alignment',
				width: 2,
				default: 'center:center',
			},

			{
				type: 'alignmentcontrol',
				id: 'pngalignment',
				label: 'PNG Alignment',
				width: 2,
				default: 'center:center',
			},

			{
				type: 'colorpicker',
				id: 'color',
				label: 'Color',
				width: 2,
				default: rgb(255, 255, 255),
			},

			{
				type: 'colorpicker',
				id: 'bgcolor',
				label: 'Background',
				width: 2,
				default: rgb(0, 0, 0),
			},

			{
				type: 'checkbox',
				id: 'latch',
				label: 'Latch/Toggle',
				width: 2,
				default: false,
			},

			{
				type: 'checkbox',
				id: 'relative_delay',
				label: 'Relative Delays',
				width: 2,
				default: false,
			},
		],
	}

	system.emit('db_get', 'page_config_version', function (res) {
		if (res === undefined || res < 2) {
			// Tell all config loaders to update config to new format
			system.emit('15to32')

			for (var page in self.config) {
				for (var bank = 1; bank <= global.MAX_BUTTONS; ++bank) {
					if (self.config[page][bank] === undefined) {
						self.config[page][bank] = {}
					}
				}
			}

			// Convert config from 15 to 32 (move banks around to new setup)
			system.on('modules_loaded', convertConfig15to32)
		} else if (res > 2) {
			const errMsg =
				'You have previously installed a much newer version of companion. Since the configuration files are incompatible between major versions of companion, you need to remove the old config before continuing with this version.'
			try {
				var dialog = require('electron').dialog
				dialog.showErrorBox('Error starting companion', errMsg)
			} catch (e) {
				console.error(errMsg)
			}
			process.exit(1)
		}
	})

	system.emit('db_get', 'bank', function (res) {
		//debug("LOADING ------------",res);
		if (res !== undefined) {
			self.config = res

			/* Fix pre-v1.1.0 and pre-v2.0.0 config for banks */
			for (var page in self.config) {
				for (var bank in self.config[page]) {
					if (self.config[page][bank].style !== undefined) {
						switch (self.config[page][bank].style) {
							case 'text':
								self.config[page][bank].style = 'png'
								break
							case 'bigtext':
								self.config[page][bank].style = 'png'
								self.config[page][bank].size = 'large'
								break
							case 'smalltext':
								self.config[page][bank].style = 'png'
								self.config[page][bank].size = 'small'
								break
						}
					}
				}
			}

			// Upgrade legacy png files if they exist. pre v1.2.0
			let cfgDir
			system.emit('configdir_get', function (_cfgDir) {
				cfgDir = _cfgDir
			})
			if (fs.existsSync(path.join(cfgDir, 'banks'))) {
				for (var page in self.config) {
					if (self.config[page]) {
						for (var bank in self.config[page]) {
							if (self.config[page][bank] && self.config[page][bank].style) {
								const fullPath = path.join(cfgDir, 'banks', `${page}_${bank}.png`)
								try {
									if (fs.existsSync(fullPath)) {
										const data = fs.readFileSync(fullPath, 'base64')
										self.config[page][bank].png64 = data
									}
								} catch (e) {
									debug('Error upgrading config to inline png for bank ' + page + '.' + bank)
									debug('Reason:' + e.message)
								}
							}
						}
					}
				}

				system.emit('db_set', 'bank', self.config)
				system.emit('db_save')

				// Delete old files
				rimraf(path.join(cfgDir, 'banks'), function (err) {
					debug('Error cleaning up legacy pngs banks')
					debug('Reason:' + err)
				})
			}
		} else {
			for (var x = 1; x <= 99; x++) {
				if (self.config[x] === undefined) {
					self.config[x] = {}
					for (var y = 1; y <= global.MAX_BUTTONS; y++) {
						if (self.config[x][y] === undefined) {
							self.config[x][y] = {}
						}
					}
				}
			}
			system.emit('db_set', 'page_config_version', 2)
		}
	})

	/* Variable jiu jitsu */
	system.on('variables_changed', function (changed_variables, removed_variables) {
		const all_changed_variables = [...removed_variables, ...Object.keys(changed_variables)]

		if (all_changed_variables.length > 0) {
			for (var page in self.config) {
				for (var bank in self.config[page]) {
					var data = self.config[page][bank]

					let text = data.text
					system.emit('feedback_get_style', page, bank, function (style) {
						if (style !== undefined) {
							if (typeof style.text === 'string') {
								text = style.text
							}
						}
					})

					if (typeof text === 'string') {
						for (const variable of all_changed_variables) {
							if (text.includes(`$(${variable})`)) {
								debug('variable changed in bank ' + page + '.' + bank)
								system.emit('graphics_bank_invalidate', page, bank)
								break
							}
						}
					}
				}
			}
		}
	})

	system.on('bank_update', function (cfg) {
		debug('bank_update saving')
		self.config = cfg // in case new reference
		system.emit('db_set', 'bank', cfg)
		system.emit('db_save')
	})

	system.on('bank_set_key', function (page, bank, key, val) {
		if (self.config[page] !== undefined && self.config[page][bank] !== undefined) {
			self.config[page][bank][key] = val
			system.emit('db_set', 'bank', self.config)
			system.emit('db_save')
		}
	})

	system.on('bank_changefield', function (page, bank, key, val) {
		// Cleanup any rotary actions that are now hidden/disabled
		if (key === 'rotary_actions') {
			system.emit('clear_bank_rotary_actions', page, bank)
		}

		self.config[page][bank][key] = val
		system.emit('bank_update', self.config)
		system.emit('graphics_bank_invalidate', page, bank)
	})

	system.on('io_connect', function (client) {
		function sendResult(answer, name, ...args) {
			if (typeof answer === 'function') {
				answer(...args)
			} else {
				client.emit(name, ...args)
			}
		}

		client.on('graphics_preview_generate', function (config, answer) {
			system.emit('graphics_preview_generate', config, function (img) {
				answer(img)
			})
		})

		client.on('bank_reset', function (page, bank) {
			system.emit('bank_reset', page, bank)
			client.emit('bank_reset', page, bank)
		})

		client.on('get_all_banks', function () {
			client.emit('get_all_banks:result', self.config)
		})

		client.on('get_bank', function (page, bank, answer) {
			system.emit('get_bank', page, bank, function (config) {
				var fields = []
				if (config.style !== undefined && self.fields[config.style] !== undefined) {
					fields = self.fields[config.style]
				}

				sendResult(answer, 'get_bank:results', page, bank, config, fields)
			})
		})

		client.on('hot_press', function (page, button, direction) {
			debug('being told from gui to hot press', page, button, direction)
			system.emit('bank_pressed', page, button, direction)
		})

		client.on('hot_rotate', function (page, button, direction) {
			debug('being told from gui to hot rotate', page, button, direction)
			system.emit('bank_rotated', page, button, direction)
		})

		client.on('bank_set_png', function (page, bank, dataurl, answer) {
			if (!dataurl.match(/data:.*?image\/png/)) {
				sendResult(answer, 'bank_set_png:result', 'error')
				return
			}

			var data = dataurl.replace(/^.*base64,/, '')
			self.config[page][bank].png64 = data
			system.emit('bank_update', self.config)

			sendResult(answer, 'bank_set_png:result', 'ok')
			system.emit('graphics_bank_invalidate', page, bank)
		})

		client.on('bank_clear_png', function (page, bank) {
			delete self.config[page][bank].png64
			system.emit('bank_update', self.config)

			client.emit('bank_clear_png:result')
			system.emit('graphics_bank_invalidate', page, bank)
		})

		client.on('bank_changefield', function (page, bank, key, val) {
			system.emit('bank_changefield', page, bank, key, val)
		})

		client.on('bank_copy', function (pagefrom, bankfrom, pageto, bankto) {
			if (pagefrom != pageto || bankfrom != bankto) {
				var exp

				system.emit('export_bank', pagefrom, bankfrom, function (_exp) {
					exp = _exp
				})

				system.emit('import_bank', pageto, bankto, exp)
			}

			client.emit('bank_copy:result', null, 'ok')
		})

		client.on('bank_move', function (pagefrom, bankfrom, pageto, bankto) {
			if (pagefrom != pageto || bankfrom != bankto) {
				var exp

				system.emit('export_bank', pagefrom, bankfrom, function (_exp) {
					exp = _exp
				})
				system.emit('import_bank', pageto, bankto, exp)
				system.emit('bank_reset', pagefrom, bankfrom)
			}

			client.emit('bank_move:result', null, 'ok')
		})

		client.on('bank_style', function (page, bank, style, answer) {
			system.emit('bank_style', page, bank, style, function (fields) {
				sendResult(answer, 'bank_style:results', page, bank, self.config[page][bank], fields)
			})
		})

		client.on('disconnect', function () {
			// In theory not needed. But why not.
			client.removeAllListeners('graphics_preview_generate')
			client.removeAllListeners('bank_reset')
			client.removeAllListeners('get_all_banks')
			client.removeAllListeners('get_bank')
			client.removeAllListeners('hot_press')
			client.removeAllListeners('hot_rotate')
			client.removeAllListeners('bank_set_png')
			client.removeAllListeners('bank_changefield')
			client.removeAllListeners('bank_copy')
			client.removeAllListeners('bank_move')
			client.removeAllListeners('bank_style')
		})
	})

	system.on('bank_style', function (page, bank, style, cb) {
		if (self.config[page] === undefined) self.config[page] = {}

		if (style == 'none' || self.config[page][bank] === undefined || self.config[page][bank].style === undefined) {
			self.config[page][bank] = undefined
		}

		if (style == 'none') {
			system.emit('bank_update', self.config, undefined)
			system.emit('graphics_bank_invalidate', page, bank)
			system.emit('bank_style_changed', page, bank)
			cb(undefined)
			return
		} else if (style == 'pageup') {
			system.emit('bank_reset', page, bank)
		} else if (style == 'pagenum') {
			system.emit('bank_reset', page, bank)
		} else if (style == 'pagedown') {
			system.emit('bank_reset', page, bank)
		}

		self.config[page][bank] = {
			style: style,
		}

		var fields = []
		if (self.fields[style] !== undefined) {
			fields = self.fields[style]
		}

		// Install default values
		for (var i = 0; i < fields.length; ++i) {
			if (fields[i].default !== undefined) {
				self.config[page][bank][fields[i].id] = fields[i].default
			}
		}

		system.emit('bank_update', self.config, fields)
		system.emit('instance_status_check_bank', page, bank)
		system.emit('graphics_bank_invalidate', page, bank)
		system.emit('bank_style_changed', page, bank)

		if (cb !== undefined) {
			cb(fields)
		}
	})

	system.on('bank_reset', function (page, bank) {
		if (self.config[page] === undefined) self.config[page] = {}
		self.config[page][bank] = {}
		system.emit('instance_status_check_bank', page, bank)
		system.emit('graphics_bank_invalidate', page, bank)
		system.emit('bank_update', self.config)
		system.emit('bank_style_changed', page, bank)
	})

	system.on('bank_rename_variables', function (from, to) {
		for (var page in self.config) {
			for (var bank in self.config[page]) {
				if (self.config[page][bank].style !== undefined && self.config[page][bank].text !== undefined) {
					system.emit('variable_rename_callback', self.config[page][bank].text, from, to, function (result) {
						if (self.config[page][bank].text !== result) {
							debug('rewrote ' + self.config[page][bank].text + ' to ' + result)
							self.config[page][bank].text = result
						}
					})
				}
			}
		}
	})

	system.on('get_banks_for_page', function (page, cb) {
		if (self.config[page] === undefined) cb({})
		else cb(self.config[page])
	})

	system.on('get_bank', function (page, bank, cb) {
		if (self.config[page] === undefined) cb({})
		else if (self.config[page][bank] === undefined) cb({})
		else cb(self.config[page][bank])
	})

	system.on('bank_update_request', function () {
		system.emit('bank_update', self.config)
	})

	system.on('ready', function () {
		system.emit('bank_update', self.config)
	})

	function from15to32(key) {
		key = key - 1

		var rows = Math.floor(key / 5)
		var col = (key % 5) + 1
		var res = rows * 8 + col

		if (res >= 32) {
			debug('assert: old config had bigger pages than expected')
			return 31
		}
		return res
	}
	function from12to32(key) {
		key = key - 1

		var rows = Math.floor(key / 4)
		var col = (key % 4) + 2
		var res = rows * 8 + col

		if (res >= 32) {
			debug('assert: old config had bigger pages than expected')
			return 31
		}
		return res
	}

	system.on('bank_get15to32', function (key, cb) {
		cb(from15to32(key))
	})
	system.on('bank_get12to32', function (key, cb) {
		cb(from12to32(key))
	})

	function convertConfig15to32() {
		var old_config, old_bank_actions, old_bank_release_actions, old_feedbacks

		system.emit('db_get', 'bank', function (res) {
			self.config = res

			old_config = _.cloneDeep(res)
		})
		system.emit('action_get_banks', function (bank_actions) {
			old_bank_actions = _.cloneDeep(bank_actions)
		})

		system.emit('release_action_get_banks', function (bank_release_actions) {
			old_bank_release_actions = _.cloneDeep(bank_release_actions)
		})

		system.emit('feedback_getall', function (feedbacks) {
			old_feedbacks = _.cloneDeep(feedbacks)
		})

		if (self.config === undefined) {
			self.config = {}
			system.emit('db_set', 'bank', self.config)
		}
		if (old_bank_actions === undefined) {
			old_bank_actions = {}
		}
		if (old_bank_actions === undefined) {
			old_bank_actions = {}
		}

		for (var page = 1; page <= 99; ++page) {
			if (self.config[page] === undefined) {
				self.config[page] = {}
			}

			// Reset
			for (var i = 0; i < 32; ++i) {
				system.emit('bank_reset', page, i + 1)
			}

			// Add navigation keys
			system.emit('import_bank', page, 1, { config: { style: 'pageup' } })
			system.emit('import_bank', page, 9, { config: { style: 'pagenum' } })
			system.emit('import_bank', page, 17, { config: { style: 'pagedown' } })

			// Move keys around
			for (var b in old_config[page]) {
				var old = exportOldConfig(page, b)

				system.emit('import_bank', page, from12to32(b), old)
			}
		}

		system.emit('db_set', 'bank', self.config)
		system.emit('db_set', 'page_config_version', 2)

		function exportOldConfig(page, bank) {
			var exp = {}

			exp.config = _.cloneDeep(old_config[page][bank])
			exp.instances = {}

			if (old_bank_actions[page] !== undefined) {
				exp.actions = _.cloneDeep(old_bank_actions[page][bank])
			}

			if (old_bank_release_actions[page] !== undefined) {
				exp.release_actions = _.cloneDeep(old_bank_release_actions[page][bank])
			}

			if (old_feedbacks[page] !== undefined) {
				exp.feedbacks = _.cloneDeep(old_feedbacks[page][bank])
			}

			return exp
		}
	}
}

exports = module.exports = function (system) {
	return new bank(system)
}
