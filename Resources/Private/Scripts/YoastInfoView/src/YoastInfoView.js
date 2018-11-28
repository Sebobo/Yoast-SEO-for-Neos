import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {$transform, $get} from 'plow-js';
import {Icon, Button, IconButton} from '@neos-project/react-ui-components';
import {neos} from '@neos-project/neos-ui-decorators';
import {actions, selectors} from '@neos-project/neos-ui-redux-store';
import {fetchWithErrorHandling} from '@neos-project/neos-ui-backend-connector';
import {Paper, AnalysisWorkerWrapper, createWorker} from 'yoastseo';
import {scoreToRating} from 'yoastseo/src/interpreters';
import Jed from "jed";
import style from './style.css';
import PageParser from "./helper/pageParser";
import {yoastActions} from './actions';

@connect(state => ({
    focusedNodeContextPath: selectors.CR.Nodes.focusedNodePathSelector(state),
    getNodeByContextPath: selectors.CR.Nodes.nodeByContextPath(state),
    worker: $get('ui.yoastInfoView.worker', state),
    translations: $get('ui.yoastInfoView.translations', state),
}), {
    setWorker: yoastActions.setWorker,
    setTranslations: yoastActions.setTranslations,
})
@connect($transform({
    contextPath: $get('ui.contentCanvas.contextPath'),
    canvasSrc: $get('ui.contentCanvas.src'),
    editPreviewMode: selectors.UI.EditPreviewMode.currentEditPreviewMode,
}), {
    setEditPreviewMode: actions.UI.EditPreviewMode.set,
})
@neos(globalRegistry => ({
    i18nRegistry: globalRegistry.get('i18n'),
    serverFeedbackHandlers: globalRegistry.get('serverFeedbackHandlers'),
}))
export default class YoastInfoView extends PureComponent {
    static propTypes = {
        translations: PropTypes.array,
        canvasSrc: PropTypes.string,
        contextPath: PropTypes.string,
        focusedNodeContextPath: PropTypes.string,
        getNodeByContextPath: PropTypes.func.isRequired,
        setTranslations: PropTypes.func.isRequired,
        setWorker: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        const {focusedNodeContextPath, getNodeByContextPath} = this.props;
        const node = getNodeByContextPath(focusedNodeContextPath);

        this.state = {
            nodeUri: $get('uri', node),
            focusKeyword: $get('properties.focusKeyword', node),
            isCornerstone: $get('properties.isCornerstone', node),
            workerUrl: '/_Resources/Static/Packages/Shel.Neos.YoastSeo/Scripts/WebWorker.js', // TODO: Resolve path via Neos api
            page: {
                title: '',
                description: '',
                isAnalyzing: false,
                locale: 'en_US'
            },
            content: {
                score: 0,
                results: [],
                isAnalyzing: false,
                expanded: false
            },
            seo: {
                score: 0,
                results: [],
                isAnalyzing: false,
                expanded: false
            },
            i18n: {}
        };
    }

    componentDidMount() {
        this.fetchTranslations();
        this.fetchContent();
        this.props.serverFeedbackHandlers.set('Neos.Neos.Ui:ReloadDocument/DocumentUpdated', () => {
            this.fetchContent();
        }, 'after Neos.Neos.Ui:ReloadDocument/Main');
    }

    fetchTranslations = () => {
        if (this.props.translations) {
            this.setState({
                i18n: new Jed(this.props.translations)
            });
            return;
        }

        fetchWithErrorHandling.withCsrfToken(csrfToken => ({
            url: '/neosyoastseo/data/fetchTranslations',
            method: 'GET',
            credentials: 'include',
            headers: {
                'X-Flow-Csrftoken': csrfToken,
                'Content-Type': 'application/json'
            }
        }))
            .then(response => response && response.json())
            .then(translations => {
                if (!translations || translations.error) {
                    translations = {
                        domain: "js-text-analysis",
                        // eslint-disable-next-line camelcase
                        locale_data: {
                            "js-text-analysis": {
                                "": {}
                            }
                        }
                    };
                }

                this.setState({
                    i18n: new Jed(translations)
                });
                this.props.setTranslations(translations);
            });
    };

    fetchContent = () => {
        this.setState({
            page: {
                ...this.state.page,
                isAnalyzing: true
            },
            seo: {
                ...this.state.seo,
                isAnalyzing: true
            },
            content: {
                ...this.state.content,
                isAnalyzing: true
            }
        });

        fetchWithErrorHandling.withCsrfToken(csrfToken => ({
            url: `/neosyoastseo/page/renderPreviewPage?node=${this.props.contextPath}`,
            method: 'GET',
            credentials: 'include',
            headers: {
                'X-Flow-Csrftoken': csrfToken,
                'Content-Type': 'text/html'
            }
        }))
            .then(response => {
                if (!response) {
                    return;
                }
                this.setState({slug: new URL(response.url).pathname.split('@')[0]});
                return response.text();
            })
            .then(documentContent => {
                const pageParser = new PageParser(documentContent);

                this.setState({
                    pageContent: pageParser.pageContent,
                    page: {
                        locale: pageParser.locale,
                        title: pageParser.title,
                        description: pageParser.description,
                        isAnalyzing: false
                    },
                    results: {}
                }, this.refreshAnalysis);
            });
    };

    refreshAnalysis = () => {
        let {worker} = this.props;
        if (!worker) {
            worker = new AnalysisWorkerWrapper(createWorker(this.state.workerUrl));
            this.props.setWorker(worker);
        }
        // Initialize the worker when the configuration has changed
        worker.initialize({
            useCornerstone: this.state.isCornerstone,
            locale: this.state.page.locale,
            contentAnalysisActive: true,
            keywordAnalysisActive: true,
            logLevel: "ERROR"
        }).then(() => {
            let paper = new Paper(
                this.state.pageContent,
                {
                    keyword: this.state.focusKeyword,
                    description: this.state.page.description,
                    title: this.state.page.title,
                    titleWidth: this.getTitleWidth(),
                    url: this.state.slug,
                    locale: this.state.page.locale,
                    permalink: ""
                }
            );
            this.setState({worker: worker});
            return worker.analyze(paper);
        }).then((results) => {
            this.setState({
                seo: {
                    score: results.result.seo[''].score,
                    results: this.parseResults(results.result.seo[''].results),
                    isAnalyzing: false
                },
                content: {
                    score: results.result.readability.score,
                    results: this.parseResults(results.result.readability.results),
                    isAnalyzing: false
                }
            });
        }).catch((error) => {
            console.error('An error occured while analyzing the page:');
            console.error(error);
        });
    };

    getTitleWidth = () => {
        // TODO: This is just a basic approximation and should be calculated in the future based on the actual text.
        return this.state.page.title.length * 8.5;
    };

    parseResults = (results) => {
        return results.reduce((obj, result) => {
            obj[result._identifier] = {
                identifier: result._identifier,
                rating: scoreToRating(result.score),
                score: result.score,
                text: result.text
            };
            return obj;
        }, {});
    };

    renderResults = (results, filter = []) => {
        let groupedResults = {
            'bad': [],
            'ok': [],
            'good': []
        };

        Object.values(results).forEach(result => {
            if (filter.indexOf(result.identifier) === -1 && result.rating in groupedResults) {
                groupedResults[result.rating].push(result);
            }
        });

        return (
            <li className={style.yoastInfoView__item}>
                <div className={style.yoastInfoView__title}>
                    {this.props.i18nRegistry.translate('inspector.results', 'Analysis results', {}, 'Shel.Neos.YoastSeo')}
                </div>
                {groupedResults.bad.map(result => this.renderRating(result))}
                {groupedResults.ok.map(result => this.renderRating(result))}
                {groupedResults.good.map(result => this.renderRating(result))}
            </li>
        );
    };

    handleExpandContentClick = () => {
        this.setState({
            content: {
                ...this.state.content,
                expanded: !this.state.content.expanded
            }
        });
    };

    handleExpandSeoClick = () => {
        this.setState({
            seo: {
                ...this.state.seo,
                expanded: !this.state.seo.expanded
            }
        });
    };

    handleToggleSnippetPreviewClick = () => {
        const {setEditPreviewMode, editPreviewMode} = this.props;

        setEditPreviewMode(editPreviewMode === 'shelYoastSeoView' ? 'inPlace' : 'shelYoastSeoView');
    };

    renderRating = (result) => {
        return result && (
            <p className={style.yoastInfoView__content}
               title={this.props.i18nRegistry.translate('inspector.resultType.' + result.identifier, result.identifier, {}, 'Shel.Neos.YoastSeo')}>
                <svg height="13" width="6" className={style['yoastInfoView__rating_' + result.rating]}>
                    <circle cx="3" cy="9" r="3"/>
                </svg>
                <span dangerouslySetInnerHTML={{__html: result.text}}/>
            </p>
        );
    };

    renderTitleRating = () => {
        return (
            <li className={style.yoastInfoView__item}>
                <div className={style.yoastInfoView__title}>
                    {this.props.i18nRegistry.translate('inspector.renderedTitle', 'Rendered title', {}, 'Shel.Neos.YoastSeo')}
                </div>
                <div className={style.yoastInfoView__value}>{this.state.page.title}</div>
            </li>
        );
    };

    renderDescriptionRating = () => {
        return (
            <li className={style.yoastInfoView__item}>
                <div className={style.yoastInfoView__title}>
                    {this.props.i18nRegistry.translate('inspector.renderedDescription', 'Rendered description', {}, 'Shel.Neos.YoastSeo')}
                </div>
                <div className={style.yoastInfoView__value}>{this.state.page.description}</div>
            </li>
        );
    };

    renderOverallScore = (label, rating) => {
        return (
            <span className={style.yoastInfoView__score}>
                <Icon icon={rating < 90 ? 'circle' : 'smile'} padded={'right'}
                      className={style['yoastInfoView__rating_' + (rating < 90 ? 'average' : 'good')]}/> {label}
            </span>
        );
    };

    renderSnippetPreviewButton = () => {
        return (
            <li className={style.yoastInfoView__item} style={{textAlign: 'center'}}>
                <Button style="lighter" hoverStyle="brand" onClick={this.handleToggleSnippetPreviewClick}>
                    <span>
                        <Icon icon={'edit'}/>
                        &nbsp;{this.props.i18nRegistry.translate('inspector.editSnippetPreview', 'Toggle Snippet Preview', {}, 'Shel.Neos.YoastSeo')}
                    </span>
                </Button>
            </li>
        );
    };

    render() {
        const {i18nRegistry} = this.props;
        const contentResultsIconState = this.state.content.expanded ? 'chevron-up' : 'chevron-down';
        const seoResultsIconState = this.state.seo.expanded ? 'chevron-up' : 'chevron-down';

        return (
            <ul className={style.yoastInfoView}>
                {this.renderSnippetPreviewButton()}

                {!this.state.seo.isAnalyzing && this.renderTitleRating()}
                {!this.state.seo.isAnalyzing && this.renderDescriptionRating()}

                {!this.state.content.isAnalyzing && (
                    <li>
                        <div className={style.yoastInfoView__heading}>
                            {this.renderOverallScore(i18nRegistry.translate('inspector.contentScore', 'Readability analysis', {}, 'Shel.Neos.YoastSeo'), this.state.content.score)}
                            <IconButton icon={contentResultsIconState} className={style.rightSideBar__toggleBtn}
                                        onClick={this.handleExpandContentClick}/>
                        </div>
                    </li>
                )}
                {!this.state.content.isAnalyzing && this.state.content.expanded && this.renderResults(this.state.content.results)}


                {!this.state.seo.isAnalyzing && (
                    <li>
                        <div className={style.yoastInfoView__heading}>
                            {this.renderOverallScore(i18nRegistry.translate('inspector.seoScore', 'Focus Keyphrase', {}, 'Shel.Neos.YoastSeo'), this.state.seo.score)}
                            <IconButton icon={seoResultsIconState} className={style.rightSideBar__toggleBtn}
                                        onClick={this.handleExpandSeoClick}/>
                        </div>
                    </li>
                )}
                {!this.state.seo.isAnalyzing && this.state.seo.expanded && this.renderResults(this.state.seo.results)}


                {(this.state.page.isAnalyzing || this.state.content.isAnalyzing || this.state.seo.isAnalyzing) && (
                    <li style={{textAlign: 'center'}}>
                        <Icon spin={true} icon={'spinner'}/>
                        &nbsp;{i18nRegistry.translate('inspector.loading', 'Loading…', {}, 'Shel.Neos.YoastSeo')}
                    </li>
                )}
            </ul>
        );
    }
}
