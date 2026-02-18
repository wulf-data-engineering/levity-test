<script module>
    import {defineMeta} from '@storybook/addon-svelte-csf';
    import {Input} from ".";

    const {Story} = defineMeta({
        title: 'Example/Input',
        component: Input,
        tags: ['autodocs'],
        args: {
            class: 'max-w-sm',
            placeholder: 'Type something...'
        }
    });
</script>

<Story name="Default"/>

<Story name="Disabled" args={{ 'disabled': true}}/>

<Story name="Invalid" args={{ 'aria-invalid': true}}/>

