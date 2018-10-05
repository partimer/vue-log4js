/*
*/

// Import the library
import Log4js from 'log4js'
import _ from 'lodash'

// Internal reference for self logging
var internalLogger

// Internal Options so they can be updated
/*var config =   {
    appenders: {
        console:    {type: 'console'}
    },
    categories: {
        default: { appenders: ['console'], level: 'all' }
    },
    disableClustering: true,

}*/
const config =   {
    appenders: {
        console:    {type: 'console'},
        logbus:     {type: 'log4js-vue-log-bus'}
    },
    categories: {
        default: { appenders: ['console', 'logbus'], level: 'all' }
    },
    disableClustering: true
};
/*{
    appenders: {
        console:    {type: 'console'}
    },
    categories: {
        default: { appenders: ['console'], level: 'all' }
    },
    disableClustering: true,
}*/

/*
 *
 * The following should be configured AFTER the initial install(options is called)
    vuex: {
        default: {
            store: store,
            configMutate: 'log/update_config',
            loggerMutate: 'log/update_loggerRegistry'
        }
    },
    localForage: undefined // localForage Object
    */

// logger objects
const loggerRegistry = {}

// Vuex communication objects
const storeRegistry = {}
const configMutationNameRegistry = {}
const loggersMutationNameRegistry = {}

// Persistence objects
var storage = undefined
var storageIndex='VueLog4js.config'

/*
 * Translates simple provided options into a complete config.categories entry using an existing config for defaults.
 * Returns fresh object that is NOT deep cloned from the existing config.
 * 
 */
export const simpleToLog4jsOptions = function( category='default', level, appenders ) {
    let newParts = {
        categories: {}
    }

    // Is there already an existing entry
    if( typeof config.categories[category] !== 'undefined' ) {
        newParts.categories[category] = config.categories[category]
    } else {
        // Does not exist, just use the default
        newParts.categories[category] = config.categories.default
    }
    
    if (typeof level !== 'undefined' )
        newParts.categories[category]['level'] = level
        
    if (typeof appenders !== 'undefined' )
        newParts.categories[category]['appenders'] = appenders
    
    return newParts
}

/*
 * Since config is const, reassignments of config are verboten!
 * Even if you did direct reassignments this exposes races conditions
 * when syncing to Vuex or localForage
 *  
 */
// export const mergIntoConfig = function (configObj, newParts ) {
// 
// //     if(typeof newParts.categories !== 'undefined')
// //         Object.keys(newParts.categories).forEach( (category) => {
// //             config.categories[category] = newParts.categories[category]
// //         })
// //     if(typeof newParts.appenders !== 'undefined')
// //         Object.keys(newParts.appenders).forEach( (appender) => {
// //             config.appenders[appender] = newParts.appenders[appender]
// //         })
//     Object.keys(newParts).forEach( (key1) => {
// 
//             
//         // Check if need to deeper merge or handle Array
// //         if( Array.isArray(newParts[key1]) ) {
// //             // ensure the proprty exists on configObj for assignment
// //             if( typeof configObj[key1] === 'undefined' )
// //                 configObj[key1] = []
// //             
// //             // ok just assign it
// //             configObj[key1] = newParts[key1]          
// //         } else 
//         if( typeof newParts[key1] === 'object' && !Array.isArray(newParts[key1]) ) {
//             // ensure the proprty exists on configObj for assignment
//             if( typeof configObj[key1] === 'undefined' )
//                 configObj[key1] = {}
//             
//             // recursively merge it
//             mergIntoConfig(configObj[key1], newParts[key1])
//         } else {
//             // ok just assign it
//             configObj[key1] = newParts[key1]
//         }
//     })
//     return config
// }

// Appends category to existing configuration -- returns the logger
export const logRegister = function (category='default', level, appenders) {
    // Generate a log4js categories line from the parameters
    let newParts = simpleToLog4jsOptions(category, level, appenders)
    
    // Push the revised config parts -- also persists it
    logConfig(newParts)

    // new loggers incase of updates
    loggerRegistry[category] = Log4js.getLogger(category)
    
    // commit to vuex
    vuexCommitLogger(category)
    
    // Note the Category was created
    loggerRegistry[category].info('Category logger registered! ', category)
     
    return loggerRegistry[category]
} // end logRegister()

/*
 * Bridges plugin into vuex
 */
export const logVuex = function ( store, configMutationName, loggerRegistryMutationName, storeName='default' ) {
    storeRegistry[storeName] = store
    configMutationNameRegistry[storeName] = configMutationName
    loggersMutationNameRegistry[storeName] = loggerRegistryMutationName    
}

/*
 * Kinda brute force but needs to re-assign the object to trigger mutation?
 */
const vuexCommitConfig = function (category) {
    //TODO make a version that only updates the new loggers
    Object.keys(storeRegistry).forEach( (storeName) => {
        if( typeof configMutationNameRegistry[storeName] !== 'undefined' )
            storeRegistry[storeName].commit(configMutationNameRegistry[storeName], config)      
    })
}

/*
 * Kinda brute force but needs to re-assign the object to trigger mutation?
 */
const vuexCommitLogger = function (category) {
    //TODO make a version that only updates the new loggers
    Object.keys(storeRegistry).forEach( (storeName) => {
        if( typeof loggersMutationNameRegistry[storeName] !== 'undefined' )
            storeRegistry[storeName].commit(loggersMutationNameRegistry[storeName], loggerRegistry)        
    })
}

/*
 * (1) Set the localForage compatible object
 * (2) Pulls the config from storage
 * (3) merges config
 * (4) returns a promise for the current config
 */
export const logStorage = function ( newStorage ) {
    // Case NO storage specified -- just returns 
    if( typeof newStorage === 'undefined' ) {
        return Promise.resolve(logConfig())
    }
    
    // Case new storage specified -- set and write current config
    storage=newStorage
    
    //Merge with current config -- then write it into storage
    return _readMergedStorage()
    .then( _writeStorage() )
    .then( () => {
        Promise.resolve ( logStorage() )
    })
}

/*
 * @return a promise to write the config to storage
 */
const _writeStorage = function () {
    // No storage case
     if( typeof storage === 'undefined' )
        return Promise.resolve();
    
    // Storage present
    return storage.setItem( storageIndex, config )
}

/*
 * Reads storage and merges it with the running config
 */
const _readMergedStorage = function () {
     // No storage case
     if( typeof storage === 'undefined' )
         return Promise.resolve();
     
     // storage present
     return storage.getItem(storageIndex)
     .then( (readConfig) => {
         //commit values to  config -- maybe
         if( typeof readConfig !== 'undefined' && readConfig != '' ) 
             return logConfig(readConfig)
             
         return logConfig()
     })
}

/*
 * (1) if newConfig is !== undefinded, AND is different (OVERWRITE)
 * (2) if newConf is === return a clone of the current config
 * (3) Does trigger updates to Storage and Vuex
 * @param configuration to overwrite
 * @return deep clone of current config
 * 
 */
export const logConfig = function ( newConfig ) {

    // Case newConfig Specified AND it is different
    if( typeof newConfig !== 'undefined' ){ //&& !(_.isEqual( config, newConfig )) ){
        _.merge(config, newConfig)

        Log4js.configure(config)

        // commit to Storage
        _writeStorage()
        
        // Commit to Vuex
        vuexCommitConfig()

    }
    
    // Ok return the current config
    return _.cloneDeep(config)
}

// Get the current catagories
export const logCategories = function() {
    let retVal = {}
    Object.keys(config['categories']).forEach( function (curKey) {
        retVal[curKey] = loggerRegistry[curKey].level()
    })
} // end getCategory()

export const logLevel = function(level, category) {
    if( typeof category !== 'undefined' ) {
        config['categories'][category]['level'] = level
        loggerRegistry[category].level(level)
    } else {
        
        Object.keys(config['categories']).forEach( function (curKey) {
            config['categories'][curKey]['level'] = level
            loggerRegistry[curKey].level(level)
        })
    }
}

// Plugin object
const VueLog4js = {

    // Required methow initially called when instatiated
    install(Vue, options) {
        console.log('install called for VueLog4js!')
        // if options have been specified pass them through to Log4js-node
        if (typeof options !== 'undefined' ) {
            // A hack to force disable clustering -- which errors in browsers
            options.disableClustering = true
            
            // Use provided options -- this needs to be a deep copy
            //mergIntoConfig( _.cloneDeep(options) )
            _.merge(config, options)
        }

        // Configure Log4js
        Log4js.configure(config)
        
        // Get the logger
        Vue.$log  = internalLogger = Log4js.getLogger()
        
        // Attach logger to Vue instance
        Vue.prototype.$log = Vue.$log

        // Indicate in the logs which logs are enabled
        let arrLevels = [ 'Trace', 'Debug', 'Info', 'Warn', 'Error', 'Fatal', 'Mark' ]
        arrLevels.forEach((level) => {
            Vue.$log[level.toLowerCase()]("VueLog4js:: install() "+level.toUpperCase()+" messages enabled")
        })
        
        // Attach functions
        Vue.prototype.$logRegister   = logRegister
        Vue.prototype.$logCategories = logCategories
        Vue.prototype.$logConfig = logConfig
        Vue.prototype.$logStorage = logStorage
        Vue.prototype.$logVuex = logVuex
        Vue.prototype.$logLevel = logLevel
        
        // Never do heavy lifting in a mounted()
        Vue.mixin({
            mounted() {
                //Vue.$log.trace('Logging mounted for VueLog4js!')
            }
        })
    } // end install()

}

export default VueLog4js

// Automatic installation if Vue has been added to the global scope.
if (typeof window !== 'undefined' && window.Vue) {
  window.Vue.use(VueLog4js)
}
