/**
 * State management classes for Llenado Solicitud flow
 * Encapsulates state logic to reduce code repetition
 * @module solicitudState
 */

const { FLOWS } = require("../../config/constants");

// Flow and step constants
const FLOW_NAME = FLOWS.LLENADO_SOLICITUD.NAME;
const STEPS = FLOWS.LLENADO_SOLICITUD.STEPS;

/**
 * Base class for solicitud state management
 * Provides common state structure and methods
 */
class SolicitudStateBuilder {
  constructor(state = {}) {
    this.flow = state.flow || FLOW_NAME;
    this.step = state.step;
    this.tipoPrestamo = state.tipoPrestamo;
    this.numeroAfiliacion = state.numeroAfiliacion;
    this.folio = state.folio;
    this.avales = state.avales || [];
    this.cantidadAvalesRequeridos = state.cantidadAvalesRequeridos || 0;
    this.avalesProcesados = state.avalesProcesados || 0;
    this.infoSolicitante = state.infoSolicitante;
  }

  /**
   * Sets the current step
   */
  setStep(step) {
    this.step = step;
    return this;
  }

  /**
   * Sets loan type
   */
  setTipoPrestamo(tipo) {
    this.tipoPrestamo = tipo;
    return this;
  }

  /**
   * Sets user affiliation number
   */
  setNumeroAfiliacion(numero) {
    this.numeroAfiliacion = numero;
    return this;
  }

  /**
   * Sets folio
   */
  setFolio(folio) {
    this.folio = folio;
    return this;
  }

  /**
   * Adds aval information
   */
  addAval(avalData) {
    this.avales = [...this.avales, avalData];
    return this;
  }

  /**
   * Sets required number of avales
   */
  setAvalesRequeridos(cantidad) {
    this.cantidadAvalesRequeridos = cantidad;
    return this;
  }

  /**
   * Sets number of processed avales
   */
  setAvalesProcesados(cantidad) {
    this.avalesProcesados = cantidad;
    return this;
  }

  /**
   * Sets applicant information
   */
  setInfoSolicitante(info) {
    this.infoSolicitante = info;
    return this;
  }

  /**
   * Builds and returns the state object
   */
  build() {
    return {
      flow: this.flow,
      step: this.step,
      tipoPrestamo: this.tipoPrestamo,
      numeroAfiliacion: this.numeroAfiliacion,
      folio: this.folio,
      avales: this.avales,
      cantidadAvalesRequeridos: this.cantidadAvalesRequeridos,
      avalesProcesados: this.avalesProcesados,
      infoSolicitante: this.infoSolicitante,
    };
  }
}

/**
 * Creates state for credential processing error scenarios
 */
class CredentialErrorStateBuilder extends SolicitudStateBuilder {
  /**
   * Creates state for image validation error
   */
  static forImageValidationError(currentState) {
    return new SolicitudStateBuilder(currentState)
      .setStep(STEPS.PROCESAR_CREDENCIAL)
      .build();
  }

  /**
   * Creates state for manual input requirement
   */
  static forManualInputRequired(currentState) {
    return new SolicitudStateBuilder(currentState)
      .setStep(STEPS.PROCESAR_INFO_MANUALMENTE)
      .build();
  }

  /**
   * Creates state for aval credential processing error
   */
  static forAvalImageValidationError(currentState) {
    return new SolicitudStateBuilder(currentState)
      .setStep(STEPS.PROCESAR_CREDENCIAL_AVAL)
      .build();
  }
}

/**
 * Creates state for user type specific flows
 */
class UserTypeStateBuilder extends SolicitudStateBuilder {
  /**
   * Creates state for pensioner short-term loan
   */
  static forPensionerShortTerm(currentState, infoUsuario) {
    return new SolicitudStateBuilder(currentState)
      .setStep(STEPS.CONFIRMAR_INFORMACION)
      .setNumeroAfiliacion(infoUsuario.numAfiliacion)
      .setFolio(infoUsuario.folio)
      .build();
  }

  /**
   * Creates state for pensioner medium-term loan
   */
  static forPensionerMediumTerm(currentState, infoUsuario) {
    return new SolicitudStateBuilder(currentState)
      .setStep(STEPS.PROCESAR_NUMEROS_AVALES)
      .setNumeroAfiliacion(infoUsuario.numAfiliacion)
      .setFolio(infoUsuario.folio)
      .build();
  }

  /**
   * Creates state for active employee with aval requirement
   */
  static forActiveEmployeeWithAval(currentState) {
    return new SolicitudStateBuilder(currentState)
      .setStep(STEPS.PROCESAR_CREDENCIAL_AVAL)
      .setAvalesRequeridos(1)
      .build();
  }

  /**
   * Creates state for active employee without aval requirement
   */
  static forActiveEmployeeNoAval(currentState, infoUsuario) {
    return new SolicitudStateBuilder(currentState)
      .setStep(STEPS.CONFIRMAR_INFORMACION)
      .setNumeroAfiliacion(infoUsuario.numAfiliacion)
      .setFolio(infoUsuario.folio)
      .build();
  }
}

/**
 * Creates state for PDF generation
 */
class PDFGenerationStateBuilder extends SolicitudStateBuilder {
  /**
   * Creates state for PDF generation step
   */
  static forPDFGeneration(currentState, additionalData = {}) {
    return new SolicitudStateBuilder({
      ...currentState,
      ...additionalData,
    })
      .setStep(STEPS.LLENADO_SOLICITUD_PDF)
      .build();
  }

  /**
   * Creates final state returning to main menu
   */
  static forCompletion() {
    return {
      flow: FLOWS.BIENVENIDA.NAME,
      step: FLOWS.BIENVENIDA.STEPS.MENU,
    };
  }
}

/**
 * Creates state for aval processing flow
 */
class AvalProcessingStateBuilder extends SolicitudStateBuilder {
  /**
   * Creates state for next aval processing
   */
  static forNextAval(currentState, avalData) {
    const updatedAvales = [...(currentState.avales || []), avalData];
    const cantidadProcesada = updatedAvales.length;
    const needsMoreAvales = cantidadProcesada < currentState.cantidadAvalesRequeridos;

    return new SolicitudStateBuilder(currentState)
      .setStep(needsMoreAvales ? STEPS.PROCESAR_CREDENCIAL_AVAL : STEPS.LLENADO_SOLICITUD_PDF)
      .build();
  }

  /**
   * Creates state after all avales are processed
   */
  static forAllAvalesProcessed(currentState, avalesData) {
    return new SolicitudStateBuilder(currentState)
      .setStep(STEPS.LLENADO_SOLICITUD_PDF)
      .build();
  }
}

module.exports = {
  SolicitudStateBuilder,
  CredentialErrorStateBuilder,
  UserTypeStateBuilder,
  PDFGenerationStateBuilder,
  AvalProcessingStateBuilder,
  STEPS,
  FLOW_NAME,
};
